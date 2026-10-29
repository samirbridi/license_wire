package miss

import (
	"encoding/binary"
	"errors"
	"testing"
	"time"

	"github.com/AlexxIT/go2rtc/pkg/xiaomi/crypto"
)

func sentCommands(t *testing.T, capture *playbackCapture, key []byte) []uint32 {
	var out []uint32
	for _, packet := range capture.packets {
		plain, err := crypto.Decode(packet, key)
		if err == nil && len(plain) >= 4 {
			out = append(out, binary.BigEndian.Uint32(plain))
		}
	}
	return out
}

func hasCommand(cmds []uint32, want uint32) bool {
	for _, c := range cmds {
		if c == want {
			return true
		}
	}
	return false
}

// Synthetic session: live -> SD replay -> live on one connection, without a new handshake.
func TestSharedSessionSwitchesBetweenLiveAndReplay(t *testing.T) {
	setCachedSDCatalog("sw-did", 0, []SDCatalogItem{{StartTime: 1793100000, EndTime: 1793100060, Duration: 60}})
	setCachedSDCatalog("sw-did", 10, []SDCatalogItem{{StartTime: 1793100000, EndTime: 1793100060, Duration: 60}})
	capture := &playbackCapture{}
	key := make([]byte, 32)
	client := &Client{Conn: capture, key: key, model: "xiaomi.camera.cw701", did: "sw-did"}
	src := &fakeDualSource{pkts: make(chan *Packet, 2000), closed: make(chan struct{})}
	stopped := make(chan struct{})
	hub := &dualHub{key: "sw-did", client: client, src: src, ready: make(chan struct{}), views: map[*dualView]struct{}{},
		mode: "live", field: dualField{15, 1, 1}, stop: func() { close(src.closed); close(stopped) }}
	close(hub.ready)
	dualMu.Lock()
	dualHubs["sw-did"] = hub
	dualMu.Unlock()
	dualReplayGrace, dualAfterReplay, dualLinger = 50*time.Millisecond, 1500*time.Millisecond, 200*time.Millisecond
	defer func() { dualReplayGrace, dualAfterReplay, dualLinger = 3*time.Second, 3*time.Minute, 6*time.Second }()
	go hub.run("test.mode")

	live, _ := hub.join(dualViewMain)
	replay := dualMode{playback: "1793100030", speed: "1"}
	pb, err := hub.enter(dualViewSecond, replay)
	if err != nil {
		t.Fatal(err)
	}
	_ = live.SetDeadline(time.Now().Add(200 * time.Millisecond))
	if _, err := live.ReadPacket(); err == nil || !errors.Is(err, errSwitchedToSD) {
		t.Fatalf("live view kept running during SD replay: %v", err)
	}
	cmds := sentCommands(t, capture, key)
	if !hasCommand(cmds, cmdVideoStop) || !hasCommand(cmds, cmdPlaybackReq) || !client.playbackMode {
		t.Fatalf("replay not started on the open connection: %x", cmds)
	}
	if _, err := hub.enter(dualViewMain, dualMode{}); !errors.Is(err, errPlaybackBusy) {
		t.Fatalf("live interrupted a watched replay: %v", err)
	}

	// After the switch each lens starts at its next keyframe.
	for _, p := range observedCW701(30)[2:] {
		src.pkts <- p
	}
	_ = pb.SetDeadline(time.Now().Add(300 * time.Millisecond))
	first, err := pb.ReadPacket()
	if err != nil || !startsGOP(first) {
		t.Fatalf("replay view did not start at a keyframe: %v", err)
	}

	capture.packets = nil
	_ = pb.Close()
	time.Sleep(600 * time.Millisecond) // grace + the pause between stop and start
	hub.mu.Lock()
	mode := hub.mode
	hub.mu.Unlock()
	if mode != "live" || client.playbackMode || !hasCommand(sentCommands(t, capture, key), cmdVideoStart) {
		t.Fatalf("session did not return to live: mode=%s", mode)
	}
	again, err := hub.enter(dualViewMain, dualMode{})
	if err != nil {
		t.Fatalf("recorder could not rejoin after the replay: %v", err)
	}
	_ = again.Close()
	select {
	case <-stopped:
	case <-time.After(3 * time.Second):
		t.Fatal("idle session kept open")
	}
	dualMu.Lock()
	delete(dualFields, "test.mode")
	dualMu.Unlock()
}
