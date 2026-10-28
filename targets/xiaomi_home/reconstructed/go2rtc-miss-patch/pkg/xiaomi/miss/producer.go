package miss

import (
	"encoding/json"
	"fmt"
	"net/url"
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
	initialPkts []*Packet
}

func confirmedPlayback(status string, expectedID int64) (bool,error) {
 if status=="" {return false,nil}
 var state struct { ID int64 `json:"id"`; Status string `json:"status"` }
 if err:=json.Unmarshal([]byte(status),&state);err!=nil{return false,fmt.Errorf("invalid SD playback acknowledgement")}
 if expectedID<=0||state.ID!=expectedID{return false,fmt.Errorf("SD acknowledgement belongs to another recording")}
 if state.Status!="filefound"{return false,fmt.Errorf("recording file not confirmed")}
 return true,nil
}

func Dial(rawURL string) (core.Producer, error) {
	client, err := NewClient(rawURL)
	if err != nil {
		return nil, err
	}

	u, _ := url.Parse(rawURL)
	query := u.Query()

	if playback := query.Get("playback"); playback != "" {
		err = client.StartPlayback(query.Get("channel"), playback, query.Get("endtime"), query.Get("offset"), query.Get("speed"))
	} else {
		err = client.StartMedia(query.Get("channel"), query.Get("subtype"), query.Get("audio"))
	}
	if err != nil {
		_ = client.Close()
		return nil, err
	}

	medias, initialPkts, err := probe(client, query.Get("audio") != "0")
	if err != nil {
		_ = client.Close()
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
			Transport:  client,
		},
		client:      client,
		initialPkts: initialPkts,
	}, nil
}

func probe(client *Client, audio bool) ([]*core.Media, []*Packet, error) {
	probeTimeout := 15 * time.Second
	if client.playbackMode {
		probeTimeout = 6500 * time.Millisecond
	}
	_ = client.SetDeadline(time.Now().Add(probeTimeout))

	var vcodec, acodec *core.Codec
	var buffered []*Packet
	videoPackets := 0

	for {
		pkt, err := client.ReadPacket()
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
			confirmed,statusErr:=confirmedPlayback(client.LastPlaybackStatus(),client.lastPlaybackSession.Load())
			if statusErr!=nil{return nil,nil,statusErr}
			if !confirmed {continue}
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
		if vcodec != nil && (acodec != nil || !audio || videoPackets > maxWaitVideo) {
			break
		}
	}

	_ = client.SetDeadline(time.Time{})

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
			_ = p.client.SetDeadline(time.Now().Add(10 * time.Second))
			pkt, err = p.client.ReadPacket()
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
				recv.WriteRTP(pkt2)
				break
			}
		}
	}
}

func (p *Producer) Stop() error {
	_ = p.client.StopMedia()
	return p.Connection.Stop()
}

// TimeToRTP convert time in milliseconds to RTP time
func TimeToRTP(timeMS, clockRate uint64) uint32 {
	return uint32(timeMS * clockRate / 1000)
}
