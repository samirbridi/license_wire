package miss

import (
	"errors"
	"testing"
	"time"
)

// Synthetic fixtures: interleaved frames of two lenses tagged 0/10 at a header position.
func dualPacket(codec uint32, seq int, lens byte, offset int, keyframe bool) *Packet {
	p := &Packet{CodecID: codec, Payload: []byte{0, 0, 0, 1, 0x02, 0x01}}
	if keyframe {
		p.Payload[4] = 32 << 1 // H.265 VPS
	}
	p.Header[8] = byte(seq)
	p.Header[16] = byte(seq * 50) // timestamps vary and must never be chosen
	p.Header[offset] = lens
	return p
}

func interleaved(offset, n int) []*Packet {
	var out []*Packet
	for i := 0; i < n; i++ {
		out = append(out, dualPacket(codecH265, i, 0, offset, i%20 == 0))
		out = append(out, dualPacket(codecH265, i, 10, offset, i%20 == 0))
		if i%2 == 0 {
			out = append(out, &Packet{CodecID: codecOPUS, Payload: []byte{1}})
		}
	}
	return out
}

func TestDetectDualFieldFindsLensTag(t *testing.T) {
	for _, offset := range []int{28, 24, 13} {
		field, ok := detectDualField(interleaved(offset, 30))
		if !ok || field.offset != offset {
			t.Fatalf("offset %d: got %v %v", offset, field, ok)
		}
	}
	if _, ok := detectDualField(interleaved(28, 10)); ok {
		t.Fatal("decided before enough video")
	}
	single := interleaved(28, 30)
	for _, p := range single {
		p.Header[28] = 0
	}
	if _, ok := detectDualField(single); ok {
		t.Fatal("single lens taken as dual")
	}
}

type fakeDualSource struct {
	pkts   chan *Packet
	closed chan struct{}
}

func (f *fakeDualSource) ReadPacket() (*Packet, error) {
	select {
	case p := <-f.pkts:
		return p, nil
	case <-f.closed:
		return nil, errors.New("closed")
	}
}

func (f *fakeDualSource) SetDeadline(time.Time) error { return nil }

func TestDualHubSplitsLensesAndClosesWithLastView(t *testing.T) {
	src := &fakeDualSource{pkts: make(chan *Packet, 1000), closed: make(chan struct{})}
	stopped := make(chan struct{})
	hub := &dualHub{key: "test", src: src, ready: make(chan struct{}), views: map[*dualView]struct{}{},
		stop: func() { close(src.closed); close(stopped) }}
	close(hub.ready)
	dualMu.Lock()
	dualHubs["test"] = hub
	dualMu.Unlock()
	main, err := hub.join(dualViewMain)
	if err != nil {
		t.Fatal(err)
	}
	second, _ := hub.join(dualViewSecond)
	go hub.run("test.model")
	for _, p := range interleaved(28, 60) {
		src.pkts <- p
	}
	read := func(v *dualView) (video, audio int) {
		_ = v.SetDeadline(time.Now().Add(200 * time.Millisecond))
		for {
			p, err := v.ReadPacket()
			if err != nil {
				return
			}
			if isVideo(p.CodecID) {
				if p.Header[28] != byte(v.lens) {
					t.Fatalf("lens %d got a frame of lens %d", v.lens, p.Header[28])
				}
				video++
			} else {
				audio++
			}
		}
	}
	if v, a := read(main); v != 60 || a != 30 {
		t.Fatalf("main view: %d video %d audio", v, a)
	}
	if v, a := read(second); v != 60 || a != 30 {
		t.Fatalf("second view: %d video %d audio", v, a)
	}
	// A late joiner starts from the latest keyframe of its lens.
	late, _ := hub.join(dualViewSecond)
	_ = late.SetDeadline(time.Now().Add(100 * time.Millisecond))
	first, err := late.ReadPacket()
	if err != nil || !startsGOP(first) || first.Header[28] != 10 {
		t.Fatalf("late joiner did not start at a keyframe: %v", err)
	}
	_ = late.Close()
	_ = main.Close()
	select {
	case <-stopped:
		t.Fatal("session closed while a view is still open")
	default:
	}
	_ = second.Close()
	select {
	case <-stopped:
	case <-time.After(time.Second):
		t.Fatal("session kept open after the last view")
	}
	dualMu.Lock()
	defer dualMu.Unlock()
	if dualHubs["test"] != nil || !dualFailures["test"].IsZero() {
		t.Fatal("closed session still registered or penalized")
	}
	delete(dualFields, "test.model")
}
