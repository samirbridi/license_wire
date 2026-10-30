package xiaomi

import (
	"bufio"
	"encoding/binary"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"github.com/AlexxIT/go2rtc/internal/api"
	"github.com/AlexxIT/go2rtc/pkg/opus"
)

// apiXiaomiTalkStream carries a whole push-to-talk in one streaming request (Mizin patch). The body is the
// microphone already encoded by the portal: for codec=opus, 2-byte big-endian length + one 20 ms Opus
// packet, repeated; for codec=pcma, raw 8 kHz A-law. The camera gets one 40 ms frame every 40 ms from a
// small jitter buffer, instead of the bursts (and gaps) of one HTTP request per microphone block.
func apiXiaomiTalkStream(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	q := r.URL.Query()
	did := strings.TrimSpace(q.Get("did"))
	if did == "" {
		http.Error(w, "missing did", http.StatusBadRequest)
		return
	}
	client, err := getOrDialClient(defaultUserID(q.Get("user")), defaultRegion(q.Get("region")), q.Get("host"), did, q.Get("model"))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	if err := client.StartSpeaker(); err != nil {
		http.Error(w, err.Error(), http.StatusConflict)
		return
	}

	codec := strings.ToLower(q.Get("codec"))
	frames := make(chan []byte, 256) // ~10 s of 40 ms frames
	var received atomic.Int64
	go func() {
		defer close(frames)
		rd := bufio.NewReaderSize(r.Body, 64*1024)
		if codec == "pcma" {
			for {
				frame := make([]byte, 320) // 40 ms of 8 kHz A-law
				if _, err := io.ReadFull(rd, frame); err != nil {
					return
				}
				received.Add(1)
				frames <- frame
			}
		}
		var pending []byte
		for {
			var size [2]byte
			if _, err := io.ReadFull(rd, size[:]); err != nil {
				if pending != nil {
					frames <- pending
				}
				return
			}
			pkt := make([]byte, binary.BigEndian.Uint16(size[:]))
			if _, err := io.ReadFull(rd, pkt); err != nil {
				return
			}
			received.Add(1)
			if pending == nil {
				pending = pkt
				continue
			}
			frames <- opus.JoinFrames(pending, pkt) // two 20 ms packets -> one 40 ms frame
			pending = nil
		}
	}()

	codecID := uint32(1032)
	if codec == "pcma" {
		codecID = 1027
	}
	// Jitter margin in 40 ms frames: the portal asks for 2 at home (same network) and 3 away.
	prebuffer, _ := strconv.Atoi(q.Get("prebuffer"))
	if prebuffer < 1 || prebuffer > 8 {
		prebuffer = 3
	}
	stats := talkPace(frames, func(frame []byte) error { return client.WriteAudio(codecID, frame) }, 40*time.Millisecond, prebuffer)
	api.ResponseJSON(w, map[string]any{
		"ok":            stats.err == nil,
		"error":         errString(stats.err),
		"packetsIn":     received.Load(),
		"framesSent":    stats.sent,
		"underruns":     stats.underruns,
		"speakerAnswer": client.LastSpeakerAnswer(),
	})
}

type talkStats struct {
	sent, underruns int
	err             error
}

// talkPace sends one frame per tick once `prebuffer` frames are queued, so bursts from the network
// become a steady stream. A late frame counts as an underrun and pacing restarts from the prebuffer.
func talkPace(frames <-chan []byte, send func([]byte) error, tick time.Duration, prebuffer int) talkStats {
	var st talkStats
	var queue [][]byte
	open := true
	fill := func(block bool) {
		if block {
			frame, ok := <-frames
			if !ok {
				open = false
				return
			}
			queue = append(queue, frame)
		}
		for open {
			select {
			case frame, ok := <-frames:
				if !ok {
					open = false
					return
				}
				queue = append(queue, frame)
			default:
				return
			}
		}
	}
	for open || len(queue) > 0 {
		for open && len(queue) < prebuffer {
			fill(true)
		}
		next := time.Now()
		for len(queue) > 0 {
			if err := send(queue[0]); err != nil {
				st.err = err
				return st
			}
			queue = queue[1:]
			st.sent++
			next = next.Add(tick)
			time.Sleep(time.Until(next))
			fill(false)
			if len(queue) == 0 && open {
				// Give a late frame one more tick before declaring the buffer empty.
				select {
				case frame, ok := <-frames:
					if !ok {
						open = false
					} else {
						queue = append(queue, frame)
					}
				case <-time.After(tick):
					st.underruns++
				}
			}
		}
	}
	return st
}

func errString(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

