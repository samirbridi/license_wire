package miss

import (
	"encoding/binary"
	"encoding/json"
	"testing"

	"github.com/AlexxIT/go2rtc/pkg/xiaomi/crypto"
)

// Synthetic catalog: each lens has its own SD file covering the requested instant.
func TestDualPlaybackRequestsBothLensesInOneSession(t *testing.T) {
	setCachedSDCatalog("dual-pb", 0, []SDCatalogItem{{StartTime: 1793100000, EndTime: 1793100060, Duration: 60}})
	setCachedSDCatalog("dual-pb", 10, []SDCatalogItem{{StartTime: 1793100002, EndTime: 1793100062, Duration: 60}})
	capture := &playbackCapture{}
	key := make([]byte, 32)
	client := &Client{Conn: capture, key: key, model: "xiaomi.camera.cw701", did: "dual-pb"}
	if err := client.StartPlaybackDual("1793100030", "1"); err != nil {
		t.Fatal(err)
	}
	var req struct {
		SessionID int64   `json:"sessionid"`
		Start     []int64 `json:"starttime"`
		Offset    []int64 `json:"offset"`
		Channel   []int   `json:"channel"`
		Merge     int     `json:"avchannelmerge"`
	}
	found := false
	for _, packet := range capture.packets {
		plain, err := crypto.Decode(packet, key)
		if err != nil || len(plain) < 4 || binary.BigEndian.Uint32(plain) != cmdPlaybackReq {
			continue
		}
		if err := json.Unmarshal(plain[4:], &req); err != nil {
			t.Fatal(err)
		}
		found = true
	}
	if !found || !client.playbackMode {
		t.Fatal("no playback request")
	}
	if req.SessionID != 1793100000 || len(req.Channel) != 2 || req.Channel[0] != 0 || req.Channel[1] != 10 || req.Merge != 1 {
		t.Fatalf("unexpected request %+v", req)
	}
	if req.Start[0] != 1793100000 || req.Start[1] != 1793100002 || req.Offset[0] != 30 || req.Offset[1] != 28 {
		t.Fatalf("lens files not resolved separately: %+v", req)
	}
}
