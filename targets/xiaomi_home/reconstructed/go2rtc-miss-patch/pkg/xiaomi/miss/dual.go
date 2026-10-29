package miss

import (
	"errors"
	"fmt"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// Dual-lens cameras (CW701) stream both lenses inside ONE session when MISS_CMD_VIDEO_START carries
// videoquality and videoquality2 (official plugin, module 11108; the second view is "<did>_10").
// Separate sessions per lens are unreliable: the camera serves one of them at a time. A hub keeps one
// session per device and feeds one view per lens.
// Observed on the NAS (2026-10-29): the lens is the top byte of the frame flags (header byte 15),
// 0 for the main lens and 1 for the second; byte 12 bit 0 marks keyframes. Detection stays automatic.
//
// The same session also serves SD replay, as the official app does: switching modes sends commands on the
// open connection instead of a new handshake. After a separate replay session the CW701 refused new
// sessions for 1.5-2.5 min (seen on the NAS, 2026-10-29), leaving the NAS recorder without the camera.

const (
	dualViewMain   = 0
	dualViewSecond = 10
)

var (
	errDualClosed    = errors.New("miss: dual view closed")
	errDualDisabled  = errors.New("miss: dual session recently failed")
	errPlaybackBusy  = errors.New("miss: SD playback in progress on this camera")
	errSwitchedToSD  = errors.New("miss: camera switched to SD playback")
	errReplayReplace = errors.New("miss: SD playback moved to another instant")
)

type dualSource interface {
	ReadPacket() (*Packet, error)
	SetDeadline(t time.Time) error
}

// dualMode is what the shared session streams: live, or the SD replay of one instant.
type dualMode struct {
	playback string // replay start (unix seconds); empty for live
	speed    string
	quality  string // live subtype
	audio    string
}

func (m dualMode) name() string {
	if m.playback == "" {
		return "live"
	}
	return "pb:" + m.playback
}

type dualHub struct {
	key    string
	client *Client
	src    dualSource
	stop   func()
	live   dualMode // how live is restarted after a replay

	ready     chan struct{}
	switchMu  sync.Mutex // serializes mode changes (camera commands)
	mu        sync.Mutex
	views     map[*dualView]struct{}
	mode      string // dualMode.name(), or "switching"
	gated     map[uint32]bool
	idleGen   int
	field     dualField
	err       error
	pending   []*Packet
	dropped   atomic.Int64
	closeOnce sync.Once
}

type dualView struct {
	hub      *dualHub
	lens     uint32
	pkts     chan *Packet
	done     chan struct{}
	err      error
	deadline atomic.Int64
	once     sync.Once
}

var (
	dualMu       sync.Mutex
	dualHubs     = map[string]*dualHub{}
	dualFailures = map[string]time.Time{}
	dualFields   = map[string]dualField{}
)

// DualEnabled reports a camera whose live and SD streams go through the shared session.
func DualEnabled(model string) bool { return dualEnabled(model) }

func dualEnabled(model string) bool {
	return model == "xiaomi.camera.cw701" && os.Getenv("MIZIN_MISS_DUAL") != "0"
}

func dualLens(channel string) uint32 {
	if channel == "" || channel == "0" {
		return dualViewMain
	}
	return dualViewSecond
}

func dualLog(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "[miss dual] "+format+"\n", args...)
}

// joinDual returns a view of the device's shared session in the wanted mode, dialing it when needed.
func joinDual(key, model string, lens uint32, want dualMode, dial func() (*Client, error)) (*dualView, *Client, error) {
	dualMu.Lock()
	if until, ok := dualFailures[key]; ok && time.Now().Before(until) {
		dualMu.Unlock()
		return nil, nil, errDualDisabled
	}
	hub := dualHubs[key]
	if hub == nil {
		hub = &dualHub{key: key, ready: make(chan struct{}), views: map[*dualView]struct{}{}, field: dualFields[model], mode: want.name()}
		if want.playback == "" {
			hub.live = want
		}
		dualHubs[key] = hub
		dualMu.Unlock()
		client, err := dial()
		if err != nil {
			hub.fail(err, 0)
			close(hub.ready)
			return nil, nil, err
		}
		hub.client = client
		hub.src = client
		hub.stop = func() { _ = client.StopMedia(); _ = client.Close() }
		close(hub.ready)
		go hub.run(model)
	} else {
		dualMu.Unlock()
		select {
		case <-hub.ready:
		case <-time.After(30 * time.Second):
			return nil, nil, fmt.Errorf("miss: shared session still connecting")
		}
	}
	view, err := hub.enter(lens, want)
	if err != nil {
		return nil, nil, err
	}
	return view, hub.client, nil
}

// join adds a view in the current mode (tests and same-mode joins).
func (h *dualHub) join(lens uint32) (*dualView, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.addViewLocked(lens)
}

func (h *dualHub) addViewLocked(lens uint32) (*dualView, error) {
	if h.err != nil {
		return nil, h.err
	}
	h.idleGen++
	v := &dualView{hub: h, lens: lens, pkts: make(chan *Packet, 1024), done: make(chan struct{})}
	h.views[v] = struct{}{}
	if h.field.ok() && !h.gated[lens] {
		// Late joiners start from the buffered tail so they reach the next keyframe quickly.
		for _, pkt := range h.pending {
			v.offer(h.field, pkt)
		}
	}
	return v, nil
}

// enter joins the wanted mode, switching the session first when needed. SD replay takes the session over
// from live views (the recorder retries later); live never interrupts a replay that is being watched.
func (h *dualHub) enter(lens uint32, want dualMode) (*dualView, error) {
	h.switchMu.Lock()
	defer h.switchMu.Unlock()
	h.mu.Lock()
	if h.err != nil {
		defer h.mu.Unlock()
		return nil, h.err
	}
	if h.mode == want.name() {
		defer h.mu.Unlock()
		return h.addViewLocked(lens)
	}
	if want.playback == "" && len(h.views) > 0 {
		h.mu.Unlock()
		return nil, errPlaybackBusy
	}
	reason := errSwitchedToSD
	if strings.HasPrefix(h.mode, "pb:") {
		reason = errReplayReplace
	}
	h.detachLocked(reason)
	h.mode = "switching"
	h.mu.Unlock()

	err := h.switchTo(want)

	h.mu.Lock()
	defer h.mu.Unlock()
	if err != nil {
		h.mu.Unlock()
		h.fail(err, 0)
		h.mu.Lock()
		return nil, err
	}
	h.setModeLocked(want)
	return h.addViewLocked(lens)
}

// detachLocked ends the views of the outgoing mode; their streams fail and reconnect on their own terms.
func (h *dualHub) detachLocked(reason error) {
	for v := range h.views {
		v.err = reason
		v.once.Do(func() { close(v.done) })
	}
	h.views = map[*dualView]struct{}{}
	h.pending = nil
}

func (h *dualHub) setModeLocked(m dualMode) {
	h.mode = m.name()
	// Frames of the previous mode may still be in flight: each lens restarts at its next keyframe.
	h.gated = map[uint32]bool{dualViewMain: true, dualViewSecond: true}
	h.pending = nil
}

// switchTo stops the current stream on the open connection and starts the wanted one.
func (h *dualHub) switchTo(want dualMode) error {
	c := h.client
	_ = c.StopMedia()
	time.Sleep(150 * time.Millisecond)
	if want.playback == "" {
		c.playbackMode = false
		live := h.live
		dualLog("session %s: back to live on the same connection", h.key)
		return c.StartMedia("dual", live.quality, live.audio)
	}
	dualLog("session %s: SD replay %s on the same connection", h.key, want.playback)
	return c.StartPlaybackDual(want.playback, want.speed)
}

// dualLinger keeps an empty live session open briefly: the recorder's check followed by continuous
// recording, or a viewer switching views, rejoins it instead of closing and reopening the connection.
// After a replay the session waits longer in live mode, so the recorder rejoins without a handshake.
var (
	dualLinger         = 6 * time.Second
	dualAfterReplay    = 3 * time.Minute
	dualReplayGrace    = 3 * time.Second
)

func (h *dualHub) leave(v *dualView) {
	h.mu.Lock()
	if _, ok := h.views[v]; !ok {
		h.mu.Unlock()
		return
	}
	delete(h.views, v)
	empty := len(h.views) == 0
	mode := h.mode
	h.idleGen++
	gen := h.idleGen
	h.mu.Unlock()
	if !empty {
		return
	}
	if strings.HasPrefix(mode, "pb:") {
		// Nobody watches the replay: after a short grace (seeks reopen it) return the connection to live.
		time.AfterFunc(dualReplayGrace, func() { h.backToLive(mode, gen) })
		return
	}
	h.closeWhenIdle(dualLinger, gen)
}

func (h *dualHub) backToLive(from string, gen int) {
	h.switchMu.Lock()
	defer h.switchMu.Unlock()
	h.mu.Lock()
	if h.err != nil || h.mode != from || len(h.views) > 0 || h.idleGen != gen {
		h.mu.Unlock()
		return
	}
	h.mode = "switching"
	h.mu.Unlock()
	if err := h.switchTo(h.live); err != nil {
		h.fail(err, 0)
		return
	}
	h.mu.Lock()
	h.setModeLocked(h.live)
	h.idleGen++
	gen = h.idleGen
	h.mu.Unlock()
	h.closeWhenIdle(dualAfterReplay, gen)
}

func (h *dualHub) closeWhenIdle(after time.Duration, gen int) {
	time.AfterFunc(after, func() {
		h.mu.Lock()
		idle := len(h.views) == 0 && h.idleGen == gen
		h.mu.Unlock()
		if idle {
			h.fail(errDualClosed, 0)
		}
	})
}

// fail closes the session and every view; backoff > 0 keeps new views on separate sessions meanwhile.
func (h *dualHub) fail(err error, backoff time.Duration) {
	h.closeOnce.Do(func() {
		h.mu.Lock()
		h.err = err
		views := make([]*dualView, 0, len(h.views))
		for v := range h.views {
			views = append(views, v)
		}
		h.views = map[*dualView]struct{}{}
		h.mu.Unlock()
		dualMu.Lock()
		if dualHubs[h.key] == h {
			delete(dualHubs, h.key)
		}
		if backoff > 0 {
			dualFailures[h.key] = time.Now().Add(backoff)
		}
		dualMu.Unlock()
		for _, v := range views {
			v.once.Do(func() { close(v.done) })
		}
		if h.stop != nil {
			h.stop()
		}
		if err != errDualClosed {
			dualLog("session %s closed: %v (dropped %d packets)", h.key, err, h.dropped.Load())
		}
	})
}

func (h *dualHub) run(model string) {
	started := time.Now()
	for {
		_ = h.src.SetDeadline(time.Now().Add(10 * time.Second))
		pkt, err := h.src.ReadPacket()
		if err != nil {
			h.fail(err, 0)
			return
		}
		h.mu.Lock()
		if h.err != nil {
			h.mu.Unlock()
			return
		}
		if h.mode == "switching" {
			h.mu.Unlock()
			continue
		}
		if !h.field.ok() {
			h.pending = append(h.pending, pkt)
			field, ok := detectDualField(h.pending)
			if ok {
				h.field = field
				dualMu.Lock()
				dualFields[model] = field
				dualMu.Unlock()
				dualLog("session %s: lens tag at header %s after %d packets", h.key, field, len(h.pending))
				for v := range h.views {
					for _, p := range h.pending {
						v.offer(field, p)
					}
				}
				h.pending = tailFromKeyframes(h.pending, field)
			} else if time.Since(started) > 10*time.Second || len(h.pending) > 800 {
				h.mu.Unlock()
				dualLog("session %s: lens tag not found; headers %s", h.key, describeHeaders(h.pending))
				h.fail(fmt.Errorf("miss: second lens not identified in the shared session"), 10*time.Minute)
				return
			}
			h.mu.Unlock()
			continue
		}
		if isVideo(pkt.CodecID) {
			lens := h.field.lens(pkt)
			if h.gated[lens] {
				if !startsGOP(pkt) {
					h.mu.Unlock()
					continue
				}
				h.gated[lens] = false
			}
		}
		for v := range h.views {
			if !v.offer(h.field, pkt) {
				h.dropped.Add(1)
			}
		}
		h.pending = appendTail(h.pending, pkt, h.field)
		h.mu.Unlock()
	}
}

// offer delivers audio to every view and video only to the view of its lens.
func (v *dualView) offer(field dualField, pkt *Packet) bool {
	if isVideo(pkt.CodecID) && field.lens(pkt) != v.lens {
		return true
	}
	select {
	case v.pkts <- pkt:
		return true
	default:
		return false
	}
}

func (v *dualView) ReadPacket() (*Packet, error) {
	var timeout <-chan time.Time
	if d := v.deadline.Load(); d > 0 {
		wait := time.Until(time.Unix(0, d))
		if wait <= 0 {
			return nil, fmt.Errorf("miss: read media: i/o timeout")
		}
		timer := time.NewTimer(wait)
		defer timer.Stop()
		timeout = timer.C
	}
	select {
	case pkt := <-v.pkts:
		return pkt, nil
	case <-v.done:
		v.hub.mu.Lock()
		err := v.err
		if err == nil {
			err = v.hub.err
		}
		v.hub.mu.Unlock()
		if err == nil {
			err = errDualClosed
		}
		return nil, fmt.Errorf("miss: read media: %w", err)
	case <-timeout:
		return nil, fmt.Errorf("miss: read media: i/o timeout")
	}
}

func (v *dualView) SetDeadline(t time.Time) error {
	if t.IsZero() {
		v.deadline.Store(0)
	} else {
		v.deadline.Store(t.UnixNano())
	}
	return nil
}

func (v *dualView) Close() error {
	v.once.Do(func() { close(v.done) })
	v.hub.leave(v)
	return nil
}

func isVideo(codec uint32) bool {
	return codec == codecH264 || codec == codecH265
}

// dualField is the header position carrying the lens tag (a single byte or a little-endian uint32)
// and the raw value that marks the second lens; zero marks the main lens.
type dualField struct {
	offset int
	width  int
	second uint32
}

func (f dualField) ok() bool { return f.width > 0 }

func (f dualField) String() string {
	return fmt.Sprintf("offset %d width %d second=%d", f.offset, f.width, f.second)
}

// lens maps the raw tag to dualViewMain or dualViewSecond; anything else matches no view.
func (f dualField) lens(pkt *Packet) uint32 {
	switch f.value(pkt) {
	case 0:
		return dualViewMain
	case f.second:
		return dualViewSecond
	}
	return 1<<32 - 1
}

func (f dualField) value(pkt *Packet) uint32 {
	h := pkt.Header[:]
	if f.width == 4 {
		return uint32(h[f.offset]) | uint32(h[f.offset+1])<<8 | uint32(h[f.offset+2])<<16 | uint32(h[f.offset+3])<<24
	}
	return uint32(h[f.offset])
}

// Candidates skip length, codec, sequence and timestamp. The observed position (byte 15, second=1) comes
// first. Byte 12 never counts as 0/1: its low bit is the keyframe flag.
var dualCandidates = func() []dualField {
	out := []dualField{{15, 1, 1}, {24, 4, 10}, {28, 4, 10}, {24, 4, 1}, {28, 4, 1}}
	for _, second := range []uint32{10, 1} {
		for _, off := range []int{12, 13, 14, 15, 24, 25, 26, 27, 28, 29, 30, 31} {
			if second == 1 && off == 12 {
				continue
			}
			out = append(out, dualField{off, 1, second})
		}
	}
	return out
}()

// detectDualField finds the header position whose video values are exactly {0, second}, each on a real
// share of the frames. It waits for at least 40 video packets.
func detectDualField(pkts []*Packet) (dualField, bool) {
	video := 0
	for _, p := range pkts {
		if isVideo(p.CodecID) {
			video++
		}
	}
	if video < 40 {
		return dualField{}, false
	}
	for _, f := range dualCandidates {
		main, second, other := 0, 0, 0
		for _, p := range pkts {
			if !isVideo(p.CodecID) {
				continue
			}
			switch f.lens(p) {
			case dualViewMain:
				main++
			case dualViewSecond:
				second++
			default:
				other++
			}
		}
		if other == 0 && main*100 >= video*15 && second*100 >= video*15 {
			return f, true
		}
	}
	return dualField{}, false
}

// tailFromKeyframes keeps, per lens, the packets from its latest parameter set on, so a late joiner can
// start decoding without waiting a full GOP.
func tailFromKeyframes(pkts []*Packet, f dualField) []*Packet {
	var out []*Packet
	for _, p := range pkts {
		out = appendTail(out, p, f)
	}
	return out
}

// dualTailAudio is how many recent audio packets the tail keeps: without them a late joiner's probe ends on
// the buffered video alone and opens the stream without its audio track (the NAS recorder requires one).
const dualTailAudio = 8

func appendTail(tail []*Packet, pkt *Packet, f dualField) []*Packet {
	if !isVideo(pkt.CodecID) {
		tail = append(tail, pkt)
		audio := 0
		for i := len(tail) - 1; i >= 0; i-- {
			if !isVideo(tail[i].CodecID) {
				if audio++; audio > dualTailAudio {
					return append(tail[:i], tail[i+1:]...)
				}
			}
		}
		return tail
	}
	if startsGOP(pkt) {
		lens := f.lens(pkt)
		kept := tail[:0]
		for _, p := range tail {
			if isVideo(p.CodecID) && f.lens(p) != lens {
				kept = append(kept, p)
			}
		}
		tail = kept
	}
	tail = append(tail, pkt)
	if len(tail) > 400 {
		tail = tail[len(tail)-400:]
	}
	return tail
}

func startsGOP(pkt *Packet) bool {
	p := pkt.Payload
	if len(p) < 5 {
		return false
	}
	nal := p[4]
	if p[2] == 1 {
		nal = p[3]
	}
	if pkt.CodecID == codecH265 {
		return (nal>>1)&0x3f == 32 // VPS
	}
	return nal&0x1f == 7 // SPS
}

func describeHeaders(pkts []*Packet) string {
	seen := map[[12]byte]int{}
	var order [][12]byte
	for _, p := range pkts {
		if !isVideo(p.CodecID) {
			continue
		}
		var k [12]byte
		copy(k[:4], p.Header[12:16])
		copy(k[4:], p.Header[24:32])
		if seen[k] == 0 {
			order = append(order, k)
		}
		seen[k]++
	}
	out := ""
	for i, k := range order {
		if i == 12 {
			break
		}
		out += fmt.Sprintf("flags=%x tail=%x x%d; ", k[:4], k[4:], seen[k])
	}
	return out
}
