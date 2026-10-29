package miss

import (
	"strings"
	"testing"
)

func TestLiveDialWaitsForSDPlayback(t *testing.T) {
	playback := &Client{Conn: &playbackCapture{}, did: "test-did", playbackMode: true}
	registerClient("test-did", playback)
	defer unregisterClient("test-did", playback)
	if !PlaybackActive("test-did") {
		t.Fatal("playback not seen")
	}
	_, err := Dial("xiaomi://127.0.0.1?did=test-did&model=xiaomi.camera.cw701")
	if err == nil || !strings.Contains(err.Error(), "SD playback") {
		t.Fatalf("live dial during playback: %v", err)
	}
	playback.closed.Store(true)
	if PlaybackActive("test-did") {
		t.Fatal("closed playback still blocks live")
	}
}
