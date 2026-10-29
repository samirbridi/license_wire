package miss

import (
	"errors"
	"encoding/json"
	"fmt"
	"net/url"
	"strconv"
	"sync"
	"time"

	"github.com/AlexxIT/go2rtc/pkg/core"
	"github.com/AlexxIT/go2rtc/pkg/h264"
	"github.com/AlexxIT/go2rtc/pkg/h264/annexb"
	"github.com/AlexxIT/go2rtc/pkg/h265"
	"github.com/pion/rtp"
)

type Producer struct {
	core.Connection
	client      *Client
	src         dualSource // the client itself, or one lens of a shared dual session
	dual        *dualView
	initialPkts []*Packet
	gop         gopCache
}

// gopCache keeps the video since the last keyframe. A viewer that joins a running stream (the NAS
// recorder keeps every camera open) gets it at once instead of waiting 2-4 s for the camera's next one.
type gopCache struct {
	mu     sync.Mutex
	pkts   []*core.Packet
	hooked map[*core.Receiver]bool
}

const gopCacheMax = 600

func (g *gopCache) add(pkt *core.Packet, keyframe bool) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if keyframe {
		g.pkts = nil
	} else if g.pkts == nil {
		return // nothing to start from until the first keyframe
	}
	if len(g.pkts) >= gopCacheMax {
		g.pkts = nil // a GOP this long is not worth replaying; wait for the next keyframe
		return
	}
	g.pkts = append(g.pkts, pkt)
}

// hook makes recv replay the cached GOP to every child that attaches later.
func (g *gopCache) hook(recv *core.Receiver) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.hooked[recv] {
		return
	}
	if g.hooked == nil {
		g.hooked = map[*core.Receiver]bool{}
	}
	g.hooked[recv] = true
	recv.OnChild = func(child *core.Node) {
		g.mu.Lock()
		pkts := append([]*core.Packet(nil), g.pkts...)
		g.mu.Unlock()
		if child.Input == nil {
			return
		}
		for _, pkt := range pkts {
			child.Input(pkt)
		}
	}
}

func confirmedPlayback(status string, expectedID int64) (bool, error) {
	if status == "" {
		return false, nil
	}
	var state struct {
		ID     int64  `json:"id"`
		Status string `json:"status"`
	}
	if err := json.Unmarshal([]byte(status), &state); err != nil {
		return false, fmt.Errorf("invalid SD playback acknowledgement")
	}
	if expectedID <= 0 || state.ID != expectedID {
		return false, fmt.Errorf("SD acknowledgement belongs to another recording")
	}
	if state.Status != "filefound" {
		return false, fmt.Errorf("recording file not confirmed")
	}
	return true, nil
}

func Dial(rawURL string) (core.Producer, error) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return nil, err
	}
	query := u.Query()

	// SD playback has priority: the camera keeps one media session, and live dials (the NAS recorder retries
	// every few seconds) would tear the playback down. Live resumes once the playback stream is closed.
	if query.Get("playback") == "" && PlaybackActive(query.Get("did")) {
		return nil, fmt.Errorf("miss: SD playback in progress on this camera")
	}

	if model := query.Get("model"); dualEnabled(model) {
		key := query.Get("did")
		if key == "" {
			key = u.Host
		}
		// Live and SD replay share one connection per camera (see dual.go).
		want := dualMode{playback: query.Get("playback"), speed: query.Get("speed"), quality: query.Get("subtype"), audio: query.Get("audio")}
		view, client, err := joinDual(key, model, dualLens(query.Get("channel")), want, func() (*Client, error) {
			client, err := NewClient(rawURL)
			if err != nil {
				return nil, err
			}
			if want.playback != "" {
				err = client.StartPlaybackDual(want.playback, want.speed)
			} else {
				err = client.StartMedia("dual", want.quality, want.audio)
			}
			if err != nil {
				_ = client.Close()
				return nil, err
			}
			return client, nil
		})
		if err == nil {
			prod, err := newProducer(client, view, query)
			if err != nil {
				_ = view.Close()
				return nil, err
			}
			return prod, nil
		}
		// Only a failed lens detection sends views back to separate sessions.
		if !errors.Is(err, errDualDisabled) {
			return nil, err
		}
		dualLog("view %s falls back to its own session: %v", query.Get("channel"), err)
	}

	client, err := NewClient(rawURL)
	if err != nil {
		return nil, err
	}

	if playback := query.Get("playback"); playback != "" {
		err = client.StartPlayback(query.Get("channel"), playback, query.Get("endtime"), query.Get("offset"), query.Get("speed"))
	} else {
		err = client.StartMedia(query.Get("channel"), query.Get("subtype"), query.Get("audio"))
	}
	if err != nil {
		_ = client.Close()
		return nil, err
	}

	prod, err := newProducer(client, nil, query)
	if err != nil {
		_ = client.Close()
		return nil, err
	}
	return prod, nil
}

func newProducer(client *Client, view *dualView, query url.Values) (*Producer, error) {
	var src dualSource = client
	var transport any = client
	if view != nil {
		src, transport = view, view
	}
	minWidth, parseErr := strconv.Atoi(query.Get("minwidth"))
	if query.Get("minwidth") == "" {
		minWidth = 0
		parseErr = nil
	}
	if parseErr != nil || minWidth < 0 || minWidth > 8192 {
		return nil, fmt.Errorf("invalid minimum video width")
	}
	medias, initialPkts, err := probe(client, src, query.Get("audio") != "0", minWidth)
	if err != nil {
		return nil, err
	}

	return &Producer{
		Connection: core.Connection{
			ID:         core.NewID(),
			FormatName: "xiaomi/miss",
			Protocol:   client.Protocol(),
			RemoteAddr: client.RemoteAddr().String(),
			UserAgent:  client.Version(),
			Medias:     medias,
			Transport:  transport,
		},
		client:      client,
		src:         src,
		dual:        view,
		initialPkts: initialPkts,
	}, nil
}

func qualifiedVideo(codec *core.Codec, minWidth int) (qualified bool) {
	defer func() {
		if recover() != nil {
			qualified = false
		}
	}()
	if codec == nil {
		return false
	}
	if minWidth == 0 {
		return true
	}
	if codec.Name == core.CodecH265 {
		_, sps, _ := h265.GetParameterSet(codec.FmtpLine)
		if len(sps) < 4 {
			return false
		}
		info := h265.DecodeSPS(sps)
		return info != nil && int(info.Width()) >= minWidth
	}
	if codec.Name == core.CodecH264 {
		sps, _ := h264.GetParameterSet(codec.FmtpLine)
		if len(sps) < 4 {
			return false
		}
		info := h264.DecodeSPS(sps)
		return info != nil && int(info.Width()) >= minWidth
	}
	return false
}

func probe(client *Client, src dualSource, audio bool, minWidth int) ([]*core.Media, []*Packet, error) {
	probeTimeout := 15 * time.Second
	if client.playbackMode {
		probeTimeout = 6500 * time.Millisecond
	}
	_ = src.SetDeadline(time.Now().Add(probeTimeout))

	var vcodec, acodec *core.Codec
	var buffered []*Packet
	videoPackets := 0

	for {
		pkt, err := src.ReadPacket()
		if err != nil {
			if vcodec != nil {
				break
			} else if acodec != nil {
				err = fmt.Errorf("no video")
			}
			return nil, nil, fmt.Errorf("xiaomi: probe: %w", err)
		}

		// On isa.camera.hlc7, 0x102 emits a few live frames before 0x10E ("filefound") switches to SD playback.
		if client.playbackMode && client.model == "isa.camera.hlc7" {
			confirmed, statusErr := confirmedPlayback(client.LastPlaybackStatus(), client.lastPlaybackSession.Load())
			if statusErr != nil {
				return nil, nil, statusErr
			}
			if !confirmed {
				continue
			}
		}

		// Some cameras send stale low-resolution frames before applying 0x102.
		// A recording may explicitly require the requested resolution before opening.
		if minWidth > 0 && vcodec == nil {
			if pkt.CodecID != codecH264 && pkt.CodecID != codecH265 {
				continue
			}
			buf := annexb.EncodeToAVCC(pkt.Payload)
			var candidate *core.Codec
			if pkt.CodecID == codecH265 && h265.NALUType(buf) == h265.NALUTypeVPS {
				candidate = h265.AVCCToCodec(buf)
			}
			if pkt.CodecID == codecH264 && h264.NALUType(buf) == h264.NALUTypeSPS {
				candidate = h264.AVCCToCodec(buf)
			}
			if !qualifiedVideo(candidate, minWidth) {
				continue
			}
			vcodec = candidate
		}
		buffered = append(buffered, pkt)

		switch pkt.CodecID {
		case codecH264:
			videoPackets++
			if vcodec == nil {
				buf := annexb.EncodeToAVCC(pkt.Payload)
				if h264.NALUType(buf) == h264.NALUTypeSPS {
					vcodec = h264.AVCCToCodec(buf)
				}
			}
		case codecH265:
			videoPackets++
			if vcodec == nil {
				buf := annexb.EncodeToAVCC(pkt.Payload)
				if h265.NALUType(buf) == h265.NALUTypeVPS {
					vcodec = h265.AVCCToCodec(buf)
				}
			}
		case codecPCMA:
			if acodec == nil {
				acodec = &core.Codec{Name: core.CodecPCMA, ClockRate: pkt.SampleRate()}
			}
		case codecOPUS:
			if acodec == nil {
				acodec = &core.Codec{Name: core.CodecOpus, ClockRate: 48000, Channels: 2}
			}
		}

		maxWaitVideo := 45
		if client.playbackMode {
			maxWaitVideo = 10
		}
		// A late joiner of the shared session gets up to a GOP of buffered video at once, with the recent
		// audio at its end: keep reading past it, or the stream opens without audio (the NAS recorder needs it).
		if _, shared := src.(*dualView); shared && !client.playbackMode {
			maxWaitVideo = 240
		}
		if vcodec != nil && (acodec != nil || !audio || videoPackets > maxWaitVideo) {
			break
		}
	}

	_ = src.SetDeadline(time.Time{})

	medias := []*core.Media{
		{
			Kind:      core.KindVideo,
			Direction: core.DirectionRecvonly,
			Codecs:    []*core.Codec{vcodec},
		},
	}

	if acodec != nil {
		medias = append(medias, &core.Media{
			Kind:      core.KindAudio,
			Direction: core.DirectionRecvonly,
			Codecs:    []*core.Codec{acodec},
		})
	}

	sendCodecs := []*core.Codec{}
	if client.SpeakerCodec() == codecOPUS {
		sendCodecs = append(sendCodecs,
			&core.Codec{Name: core.CodecOpus, ClockRate: 48000, Channels: 2},
			&core.Codec{Name: core.CodecPCMA, ClockRate: 8000},
		)
	} else {
		if acodec != nil {
			sendCodecs = append(sendCodecs, acodec.Clone())
		}
		sendCodecs = append(sendCodecs,
			&core.Codec{Name: core.CodecPCMA, ClockRate: 8000},
			&core.Codec{Name: core.CodecOpus, ClockRate: 48000, Channels: 2},
		)
	}
	medias = append(medias, &core.Media{
		Kind:      core.KindAudio,
		Direction: core.DirectionSendonly,
		Codecs:    sendCodecs,
	})

	return medias, buffered, nil
}

const timestamp40ms = 48000 * 0.040

func (p *Producer) Start() error {
	var audioTS uint32
	var videoRTPTS uint32
	var lastVideoMS uint64
	var videoSeq uint16
	var audioSeq uint16
	initial := p.initialPkts
	p.initialPkts = nil

	for {
		var pkt *Packet
		var err error
		if len(initial) > 0 {
			pkt = initial[0]
			initial = initial[1:]
		} else {
			_ = p.src.SetDeadline(time.Now().Add(10 * time.Second))
			pkt, err = p.src.ReadPacket()
			if err != nil {
				return err
			}
		}

		p.Recv += len(pkt.Payload)

		// TODO: rewrite this
		var name string
		var pkt2 *core.Packet

		switch pkt.CodecID {
		case codecH264, codecH265:
			videoSeq++
			if !p.client.playbackMode && pkt.Timestamp > 0 {
				if lastVideoMS > 0 && pkt.Timestamp > lastVideoMS && (pkt.Timestamp-lastVideoMS) < 2000 {
					videoRTPTS += uint32((pkt.Timestamp - lastVideoMS) * 90)
				} else {
					videoRTPTS += 4500 // 50ms (20fps)
				}
				lastVideoMS = pkt.Timestamp
			} else {
				// In SD playback mode (or when camera sends ts=0), advance smoothly at 20fps (4500 ticks @ 90kHz)
				if lastVideoMS > 0 && pkt.Timestamp > lastVideoMS && (pkt.Timestamp-lastVideoMS) < 500 {
					videoRTPTS += uint32((pkt.Timestamp - lastVideoMS) * 90)
				} else {
					videoRTPTS += 4500
				}
				if pkt.Timestamp > 0 {
					lastVideoMS = pkt.Timestamp
				}
			}
			pkt2 = &core.Packet{
				Header: rtp.Header{
					Version:        2,
					Marker:         true,
					SequenceNumber: videoSeq,
					Timestamp:      videoRTPTS,
				},
				Payload: annexb.EncodeToAVCC(pkt.Payload),
			}
			if pkt.CodecID == codecH264 {
				name = core.CodecH264
			} else {
				name = core.CodecH265
			}
		case codecPCMA:
			audioSeq++
			name = core.CodecPCMA
			pkt2 = &core.Packet{
				Header: rtp.Header{
					Version:        2,
					Marker:         true,
					SequenceNumber: audioSeq,
					Timestamp:      audioTS,
				},
				Payload: pkt.Payload,
			}
			audioTS += uint32(len(pkt.Payload))
		case codecOPUS:
			audioSeq++
			name = core.CodecOpus
			pkt2 = &core.Packet{
				Header: rtp.Header{
					Version:        2,
					Marker:         true,
					SequenceNumber: audioSeq,
					Timestamp:      audioTS,
				},
				Payload: pkt.Payload,
			}
			// known cameras sends packets with 40ms long
			audioTS += timestamp40ms
		}

		for _, recv := range p.Receivers {
			if recv.Codec.Name == name {
				if pkt.CodecID == codecH264 || pkt.CodecID == codecH265 {
					p.gop.hook(recv)
					p.gop.add(pkt2, startsGOP(pkt))
				}
				recv.WriteRTP(pkt2)
				break
			}
		}
	}
}

func (p *Producer) Stop() error {
	if p.dual == nil {
		_ = p.client.StopMedia()
	}
	return p.Connection.Stop()
}

// TimeToRTP convert time in milliseconds to RTP time
func TimeToRTP(timeMS, clockRate uint64) uint32 {
	return uint32(timeMS * clockRate / 1000)
}
