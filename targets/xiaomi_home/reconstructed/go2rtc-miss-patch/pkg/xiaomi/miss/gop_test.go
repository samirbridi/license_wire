package miss

import (
	"testing"

	"github.com/AlexxIT/go2rtc/pkg/core"
	"github.com/pion/rtp"
)

func TestLateViewerGetsFramesSinceKeyframe(t *testing.T) {
	var g gopCache
	recv := core.NewReceiver(nil, &core.Codec{Name: core.CodecH265})
	g.hook(recv)
	frame := func(seq uint16) *core.Packet { return &core.Packet{Header: rtp.Header{SequenceNumber: seq}} }

	g.add(frame(1), false) // before any keyframe: nothing to replay from
	g.add(frame(2), true)
	g.add(frame(3), false)
	g.add(frame(4), false)

	var got []uint16
	child := &core.Node{Input: func(p *core.Packet) { got = append(got, p.SequenceNumber) }}
	recv.AppendChild(child)
	if len(got) != 3 || got[0] != 2 || got[2] != 4 {
		t.Fatalf("late viewer got %v, want the GOP from the keyframe", got)
	}

	g.add(frame(5), true) // a new keyframe restarts the cache
	got = nil
	recv.AppendChild(&core.Node{Input: func(p *core.Packet) { got = append(got, p.SequenceNumber) }})
	if len(got) != 1 || got[0] != 5 {
		t.Fatalf("cache not restarted at the new keyframe: %v", got)
	}
}
