package miss

import (
	"github.com/AlexxIT/go2rtc/pkg/core"
	"github.com/AlexxIT/go2rtc/pkg/opus"
	"github.com/AlexxIT/go2rtc/pkg/pcm"
	"github.com/pion/rtp"
)

func (p *Producer) AddTrack(media *core.Media, _ *core.Codec, track *core.Receiver) error {
	if err := p.client.StartSpeaker(); err != nil {
		return err
	}

	sender := core.NewSender(media, track.Codec)

	switch track.Codec.Name {
	case core.CodecPCMA:
		var buf []byte

		if p.client.SpeakerCodec() == codecPCM {
			dst := &core.Codec{Name: core.CodecPCML, ClockRate: 8000}
			transcode := pcm.Transcode(dst, track.Codec)

			sender.Handler = func(pkt *rtp.Packet) {
				buf = append(buf, transcode(pkt.Payload)...)
				const size = 2 * 8000 * 0.040 // 16bit 40ms
				for len(buf) >= size {
					p.Send += size
					_ = p.client.WriteAudio(codecPCM, buf[:size])
					buf = buf[size:]
				}
			}
		} else {
			frameSize := 320 // 8000 * 0.040
			if track.Codec.ClockRate == 16000 {
				frameSize = 640
			}
			sender.Handler = func(pkt *rtp.Packet) {
				buf = append(buf, pkt.Payload...)
				for len(buf) >= frameSize {
					p.Send += frameSize
					_ = p.client.WriteAudio(codecPCMA, buf[:frameSize])
					buf = buf[frameSize:]
				}
			}
		}
	case core.CodecOpus:
		var buf []byte
		sender.Handler = func(pkt *rtp.Packet) {
			if buf == nil {
				buf = append([]byte(nil), pkt.Payload...)
			} else {
				// convert two 20ms frames into one 40ms frame
				joined := opus.JoinFrames(buf, pkt.Payload)
				buf = nil
				p.Send += len(joined)
				_ = p.client.WriteAudio(codecOPUS, joined)
			}
		}
	}

	sender.HandleRTP(track)
	p.Senders = append(p.Senders, sender)
	return nil
}
