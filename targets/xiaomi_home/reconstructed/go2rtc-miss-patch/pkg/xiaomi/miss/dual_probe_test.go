package miss

import (
	"testing"
	"time"

	"github.com/AlexxIT/go2rtc/pkg/core"
)

// Synthetic tail: a late joiner arrives 80 frames after the last keyframe, with the recent audio at the end.
func TestLateJoinerProbeKeepsAudioTrack(t *testing.T) {
	field := dualField{15, 1, 1}
	var tail []*Packet
	for i := 0; i < 80; i++ {
		p := dualPacket(codecH265, i, 0, 15, i == 0)
		tail = appendTail(tail, p, field)
	}
	for i := 0; i < dualTailAudio; i++ {
		tail = appendTail(tail, &Packet{CodecID: codecOPUS, Payload: []byte{1}}, field)
	}
	hub := &dualHub{key: "probe", views: map[*dualView]struct{}{}, mode: "live", field: field, pending: tail}
	view, err := hub.join(dualViewMain)
	if err != nil {
		t.Fatal(err)
	}
	_ = view.SetDeadline(time.Now().Add(time.Second))
	client := &Client{model: "xiaomi.camera.cw701"}
	medias, _, err := probe(client, view, true, 0)
	if err != nil {
		t.Fatal(err)
	}
	for _, m := range medias {
		if m.Kind == core.KindAudio && m.Direction == core.DirectionRecvonly {
			return
		}
	}
	t.Fatal("late joiner opened without its audio track")
}
