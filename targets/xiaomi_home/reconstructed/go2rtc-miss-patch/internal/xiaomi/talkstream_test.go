package xiaomi

import (
	"testing"
	"time"
)

// Synthetic microphone: bursts of 6 frames every 240 ms, as a 4096-sample browser buffer delivers them.
func TestTalkPaceTurnsBurstsIntoSteadyFrames(t *testing.T) {
	frames := make(chan []byte, 64)
	go func() {
		for burst := 0; burst < 4; burst++ {
			for i := 0; i < 6; i++ {
				frames <- []byte{byte(burst), byte(i)}
			}
			time.Sleep(240 * time.Millisecond)
		}
		close(frames)
	}()
	var at []time.Time
	st := talkPace(frames, func([]byte) error { at = append(at, time.Now()); return nil }, 40*time.Millisecond, 3)
	if st.err != nil || st.sent != 24 {
		t.Fatalf("sent %d frames: %v", st.sent, st.err)
	}
	for i := 1; i < len(at); i++ {
		if gap := at[i].Sub(at[i-1]); gap < 25*time.Millisecond {
			t.Fatalf("frame %d sent %v after the previous one: still bursting", i, gap)
		}
	}
}
