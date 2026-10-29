package miss

import (
	"errors"
	"fmt"
	"os"
	"sync"
	"sync/atomic"
	"time"
)

// Dual-lens cameras (CW701) stream both lenses inside ONE session when MISS_CMD_VIDEO_START carries
// videoquality and videoquality2 (official plugin, module 11108). The plugin renders the second lens as
// "<did>_10", so frames are tagged with channel 0 or 10. Separate sessions per lens are unreliable: the
// camera serves one of them at a time. A hub keeps one session per device and feeds one view per lens.

const (
	dualViewMain   = 0
	dualViewSecond = 10
)

var errDualClosed = errors.New("miss: dual view closed")

type dualSource interface {
	ReadPacket() (*Packet, error)
	SetDeadline(t time.Time) error
}

type dualHub struct {
	key    string
	client *Client
	src    dualSource
	stop   func()

	ready     chan struct{}
	mu        sync.Mutex
	views     map[*dualView]struct{}
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
	deadline atomic.Int64
	once     sync.Once
}

var (
	dualMu       sync.Mutex
	dualHubs     = map[string]*dualHub{}
	dualFailures = map[string]time.Time{}
	dualFields   = map[string]dualField{}
)

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

// joinDual returns a view of the shared session for this device, dialing it when needed.
func joinDual(key, model string, lens uint32, dial func() (*Client, error)) (*dualView, *Client, error) {
	dualMu.Lock()
	if until, ok := dualFailures[key]; ok && time.Now().Before(until) {
		dualMu.Unlock()
		return nil, nil, fmt.Errorf("miss: dual session recently failed")
	}
	hub := dualHubs[key]
	if hub == nil {
		hub = &dualHub{key: key, ready: make(chan struct{}), views: map[*dualView]struct{}{}, field: dualFields[model]}
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
		<-hub.ready
	}
	view, err := hub.join(lens)
	if err != nil {
		return nil, nil, err
	}
	return view, hub.client, nil
}

func (h *dualHub) join(lens uint32) (*dualView, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.err != nil {
		return nil, h.err
	}
	v := &dualView{hub: h, lens: lens, pkts: make(chan *Packet, 1024), done: make(chan struct{})}
	h.views[v] = struct{}{}
	if h.field.ok() {
		// Late joiners start from the buffered tail so they reach the next keyframe quickly.
		for _, pkt := range h.pending {
			v.offer(h.field, pkt)
		}
	}
	return v, nil
}

func (h *dualHub) leave(v *dualView) {
	h.mu.Lock()
	delete(h.views, v)
	empty := len(h.views) == 0
	h.mu.Unlock()
	if empty {
		h.fail(errDualClosed, 0)
	}
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
	if isVideo(pkt.CodecID) && field.value(pkt) != v.lens {
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
		err := v.hub.err
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

// dualField is the header position carrying the lens tag: a single byte or a little-endian uint32.
type dualField struct {
	offset int
	width  int
}

func (f dualField) ok() bool { return f.width > 0 }

func (f dualField) String() string {
	return fmt.Sprintf("offset %d width %d", f.offset, f.width)
}

func (f dualField) value(pkt *Packet) uint32 {
	h := pkt.Header[:]
	if f.width == 4 {
		return uint32(h[f.offset]) | uint32(h[f.offset+1])<<8 | uint32(h[f.offset+2])<<16 | uint32(h[f.offset+3])<<24
	}
	return uint32(h[f.offset])
}

// Candidates skip length, codec, sequence and timestamp. Uint32 positions are tried before single bytes.
var dualCandidates = func() []dualField {
	out := []dualField{{24, 4}, {28, 4}}
	for _, off := range []int{12, 13, 14, 15, 24, 25, 26, 27, 28, 29, 30, 31} {
		out = append(out, dualField{off, 1})
	}
	return out
}()

// detectDualField finds the header position whose video values are exactly {0, 10}, each on a real share
// of the frames. It waits for at least 40 video packets.
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
			switch f.value(p) {
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

func appendTail(tail []*Packet, pkt *Packet, f dualField) []*Packet {
	if !isVideo(pkt.CodecID) {
		return tail
	}
	if startsGOP(pkt) {
		lens := f.value(pkt)
		kept := tail[:0]
		for _, p := range tail {
			if isVideo(p.CodecID) && f.value(p) != lens {
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
