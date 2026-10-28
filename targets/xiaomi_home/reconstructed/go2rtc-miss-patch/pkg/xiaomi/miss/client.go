package miss

import (
	"bytes"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"
	"net"
	"net/url"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"github.com/AlexxIT/go2rtc/pkg/tutk"
	"github.com/AlexxIT/go2rtc/pkg/xiaomi/crypto"
	"github.com/AlexxIT/go2rtc/pkg/xiaomi/miss/cs2"
)

func debugLog(format string, args ...any) {
}

const (
	codecH264 = 4
	codecH265 = 5
	codecPCM  = 1024
	codecPCMU = 1026
	codecPCMA = 1027
	codecOPUS = 1032
)

type SDCatalogItem struct {
	StartTime uint32 `json:"startTime"`
	EndTime   uint32 `json:"endTime"`
	Duration  uint8  `json:"duration"`
	Motion    uint8  `json:"motion"`
	Save      uint8  `json:"save"`
}

var (
	activeClientsMu sync.RWMutex
	activeClients   = map[string][]*Client{}
	sdCatalogMu     sync.RWMutex
	sdCatalogCache  = map[string][]SDCatalogItem{}
)

func NormalizeChannel(model string, ch uint32) uint32 {
	if model == "xiaomi.camera.cw701" && ch == 1 {
		return 10
	}
	return ch
}

func GetCachedSDCatalog(did string, ch uint32) []SDCatalogItem {
	sdCatalogMu.RLock()
	defer sdCatalogMu.RUnlock()
	key := fmt.Sprintf("%s:%d", did, ch)
	items := sdCatalogCache[key]
	if len(items) == 0 {
		return nil
	}
	out := make([]SDCatalogItem, len(items))
	copy(out, items)
	return out
}

func setCachedSDCatalog(did string, ch uint32, items []SDCatalogItem) {
	if did == "" || len(items) == 0 {
		return
	}
	sdCatalogMu.Lock()
	defer sdCatalogMu.Unlock()
	key := fmt.Sprintf("%s:%d", did, ch)
	cp := make([]SDCatalogItem, len(items))
	copy(cp, items)
	sdCatalogCache[key] = cp
}

func registerClient(did string, c *Client) {
	if did == "" || c == nil {
		return
	}
	activeClientsMu.Lock()
	defer activeClientsMu.Unlock()
	activeClients[did] = append(activeClients[did], c)
}

func unregisterClient(did string, c *Client) {
	if did == "" || c == nil {
		return
	}
	activeClientsMu.Lock()
	defer activeClientsMu.Unlock()
	list := activeClients[did]
	out := list[:0]
	for _, item := range list {
		if item != c && !item.closed.Load() {
			out = append(out, item)
		}
	}
	if len(out) == 0 {
		delete(activeClients, did)
	} else {
		activeClients[did] = out
	}
}

func GetActiveClient(did string) *Client {
	if did == "" {
		return nil
	}
	activeClientsMu.RLock()
	defer activeClientsMu.RUnlock()
	list := activeClients[did]
	for i := len(list) - 1; i >= 0; i-- {
		c := list[i]
		if c != nil && !c.closed.Load() && !c.playbackMode {
			return c
		}
	}
	for i := len(list) - 1; i >= 0; i-- {
		c := list[i]
		if c != nil && !c.closed.Load() {
			return c
		}
	}
	return nil
}

func GetActivePlaybackClient(did string) *Client {
	if did == "" {
		return nil
	}
	activeClientsMu.RLock()
	defer activeClientsMu.RUnlock()
	list := activeClients[did]
	for i := len(list) - 1; i >= 0; i-- {
		c := list[i]
		if c != nil && !c.closed.Load() && c.playbackMode {
			return c
		}
	}
	return GetActiveClient(did)
}

func CloseClientsForDID(did string, onlyPlayback bool) {
	if did == "" {
		return
	}
	activeClientsMu.RLock()
	list := append([]*Client(nil), activeClients[did]...)
	activeClientsMu.RUnlock()
	for _, c := range list {
		if c != nil && !c.closed.Load() {
			if !onlyPlayback || c.playbackMode {
				_ = c.Close()
			}
		}
	}
}

type Conn interface {
	Protocol() string
	Version() string
	ReadCommand() (cmd uint32, data []byte, err error)
	WriteCommand(cmd uint32, data []byte) error
	ReadPacket() (hdr, payload []byte, err error)
	WritePacket(hdr, payload []byte) error
	RemoteAddr() net.Addr
	SetDeadline(t time.Time) error
	Close() error
}

func NewClient(rawURL string) (*Client, error) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return nil, err
	}

	// 1. Check if we can create shared key.
	query := u.Query()
	key, err := crypto.CalcSharedKey(query.Get("device_public"), query.Get("client_private"))
	if err != nil {
		return nil, err
	}

	model := query.Get("model")
	did := query.Get("did")
	playback := query.Get("playback") != ""

	// 2. Check if this vendor supported.
	var conn Conn
	switch s := query.Get("vendor"); s {
	case "cs2":
		conn, err = cs2.Dial(u.Host, query.Get("transport"))
	case "tutk":
		conn, err = tutk.Dial(u.Host, query.Get("uid"), "Miss", "client")
	default:
		err = fmt.Errorf("miss: unsupported vendor %s", s)
	}

	if err != nil {
		return nil, err
	}

	err = login(conn, query.Get("client_public"), query.Get("sign"))
	if err != nil {
		_ = conn.Close()
		return nil, err
	}

	client := &Client{
		Conn:         conn,
		key:          key,
		model:        model,
		did:          did,
		playbackMode: playback,
	}
	registerClient(did, client)
	go client.drainCommands()

	return client, nil
}

type Client struct {
	Conn
	key                 []byte
	model               string
	did                 string
	playbackMode        bool
	lastPlaybackSession atomic.Int64
	lastPlaybackStatus  atomic.Value
	rdtMu               sync.Mutex
	inAudioCodec        atomic.Uint32
	inAudioFlags        atomic.Uint32
	audioSeq            atomic.Uint32
	speakerMu           sync.Mutex
	speakerOn           bool
	speakerTimer        *time.Timer
	closed              atomic.Bool
}

const (
	cmdAuthReq                = 0x100
	cmdAuthRes                = 0x101
	cmdVideoStart             = 0x102
	cmdVideoStop              = 0x103
	cmdAudioStart             = 0x104
	cmdAudioStop              = 0x105
	cmdSpeakerStartReq        = 0x106
	cmdSpeakerStartRes        = 0x107
	cmdSpeakerStop            = 0x108
	cmdStreamCtrlReq          = 0x109
	cmdStreamCtrlRes          = 0x10A
	cmdGetAudioFormatReq      = 0x10B
	cmdGetAudioFormatRes      = 0x10C
	cmdPlaybackReq            = 0x10D
	cmdPlaybackRes            = 0x10E
	cmdPlaybackSetSpeed       = 0x10F
	cmdDevInfoReq             = 0x110
	cmdDevInfoRes             = 0x111
	cmdMotorReq               = 0x112
	cmdMotorRes               = 0x113
	cmdFullHorizontalMotorReq = 0x118
	cmdEncoded                = 0x1001
)

func (c *Client) drainCommands() {
	for !c.closed.Load() {
		cmd, data, err := c.Conn.ReadCommand()
		if err != nil {
			if c.closed.Load() {
				return
			}
			// Keep draining until closed; if connection error, exit loop
			return
		}
		if (cmd == cmdEncoded || cmd == 0x01100000) && len(data) > 0 {
			if dec, err := crypto.Decode(data, c.key); err == nil && len(dec) >= 4 {
				innerBE := binary.BigEndian.Uint32(dec[:4])
				innerLE := binary.LittleEndian.Uint32(dec[:4])
				debugLog("drainCommands did=%s model=%s innerBE=0x%x innerLE=0x%x body=%s", c.did, c.model, innerBE, innerLE, string(dec[4:]))
				if innerBE == cmdPlaybackRes || innerLE == cmdPlaybackRes {
					c.lastPlaybackStatus.Store(string(dec[4:]))
				}
			}
		} else if len(data) > 0 {
			debugLog("drainCommands raw did=%s model=%s cmd=0x%x body=%s", c.did, c.model, cmd, string(data))
			if cmd == cmdPlaybackRes {
				c.lastPlaybackStatus.Store(string(data))
			}
		}
	}
}

func (c *Client) Close() error {
	if c.closed.Swap(true) {
		return nil
	}
	unregisterClient(c.did, c)
	c.speakerMu.Lock()
	if c.speakerTimer != nil {
		c.speakerTimer.Stop()
		c.speakerTimer = nil
	}
	c.speakerOn = false
	c.speakerMu.Unlock()
	return c.Conn.Close()
}

func (c *Client) Model() string {
	return c.model
}

func (c *Client) DID() string {
	return c.did
}

func login(conn Conn, clientPublic, sign string) error {
	s := fmt.Sprintf(`{"public_key":"%s","sign":"%s","uuid":"","support_encrypt":0}`, clientPublic, sign)
	if err := conn.WriteCommand(cmdAuthReq, []byte(s)); err != nil {
		return err
	}

	_, data, err := conn.ReadCommand()
	if err != nil {
		return err
	}

	if !bytes.Contains(data, []byte(`"result":"success"`)) {
		return fmt.Errorf("miss: auth: %s", data)
	}

	return nil
}

func (c *Client) Version() string {
	return fmt.Sprintf("%s (%s)", c.Conn.Version(), c.model)
}

func (c *Client) WriteCommand(data []byte) error {
	data, err := crypto.Encode(data, c.key)
	if err != nil {
		return err
	}
	return c.Conn.WriteCommand(cmdEncoded, data)
}

func (c *Client) SendRawCommand(cmd uint32, jsonPayload string) error {
	data := binary.BigEndian.AppendUint32(nil, cmd)
	if jsonPayload != "" {
		data = append(data, jsonPayload...)
	}
	return c.WriteCommand(data)
}

const (
	ModelDafang  = "isa.camera.df3"
	ModelLoockV2 = "loock.cateye.v02"
	ModelC200    = "chuangmi.camera.046c04"
	ModelC300    = "chuangmi.camera.72ac1"
	// ModelXiaofang looks like it has the same firmware as the ModelDafang.
	// There is also an older model "isa.camera.isc5" that only works with the legacy protocol.
	ModelXiaofang = "isa.camera.isc5c1"
)

func (c *Client) StartMedia(channel, quality, audio string) error {
	switch c.model {
	case ModelDafang, ModelXiaofang:
		var q, a byte
		if quality == "sd" {
			q = 1 // 0 - hd, 1 - sd, default - hd
		}
		if audio != "0" {
			a = 1 // 0 - off, 1 - on, default - on
		}

		return errors.Join(
			c.WriteCommand(dafangVideoQuality(q)),
			c.WriteCommand(dafangVideoStart(1, a)),
		)
	}

	// 0 - auto, 1 - sd, 2 - hd, default - hd
	switch quality {
	case "", "hd":
		// Different models require different default quality settings.
		switch c.model {
		case ModelC200, ModelC300, "xiaomi.camera.cw701", "mxiang.camera.mod11":
			quality = "3"
		case "isa.camera.hlc7":
			quality = "4"
		default:
			quality = "2"
		}
	case "sd":
		quality = "1"
	case "auto":
		quality = "0"
	}

	if audio == "" {
		audio = "1"
	}

	data := binary.BigEndian.AppendUint32(nil, cmdVideoStart)
	switch channel {
	case "", "0":
		data = fmt.Appendf(data, `{"videoquality":%s,"enableaudio":%s}`, quality, audio)
	default:
		data = fmt.Appendf(data, `{"videoquality":-1,"videoquality2":%s,"enableaudio":%s}`, quality, audio)
	}
	return c.WriteCommand(data)
}

func (c *Client) resolvePlaybackTarget(normCh uint32, targetSec int64, explicitOffset int64) (int64, int64) {
	items := GetCachedSDCatalog(c.did, normCh)
	if len(items) == 0 {
		if fetched, err := c.QuerySDCatalog(normCh); err == nil && len(fetched) > 0 {
			items = fetched
		}
	}
	if len(items) == 0 {
		return targetSec, explicitOffset
	}

	target := uint32(targetSec)
	// 1. Exact file start match
	for _, it := range items {
		if it.StartTime == target {
			return int64(it.StartTime), explicitOffset
		}
	}
	// 2. Target falls inside [it.StartTime, it.EndTime)
	for _, it := range items {
		dur := uint32(it.Duration)
		if dur == 0 {
			dur = 60
		}
		if target >= it.StartTime && target < it.StartTime+dur {
			off := int64(target - it.StartTime)
			if explicitOffset > 0 {
				off += explicitOffset
			}
			if off >= int64(dur) {
				off = int64(dur) - 1
			}
			return int64(it.StartTime), off
		}
	}
	// 3. Nearest recording file within 300 seconds (preferring the next or closest segment)
	bestIdx := -1
	bestDiff := int64(1 << 60)
	for i, it := range items {
		diff := int64(it.StartTime) - targetSec
		if diff < 0 {
			diff = -diff
		}
		if diff < bestDiff {
			bestDiff = diff
			bestIdx = i
		}
	}
	if bestIdx >= 0 && bestDiff <= 300 {
		it := items[bestIdx]
		off := targetSec - int64(it.StartTime)
		if off < 0 {
			off = 0
		}
		dur := int64(it.Duration)
		if dur <= 0 {
			dur = 60
		}
		if off >= dur {
			off = 0
		}
		return int64(it.StartTime), off
	}

	return targetSec, explicitOffset
}

func (c *Client) StartPlayback(channel, startSecStr, endSecStr, offsetSecStr, speedStr string) error {
	c.playbackMode = true
	startSec, err := strconv.ParseInt(startSecStr, 10, 64)
	if err != nil || startSec <= 0 {
		return fmt.Errorf("miss: invalid playback start timestamp: %s", startSecStr)
	}
	endSec, _ := strconv.ParseInt(endSecStr, 10, 64)
	if endSec < 0 {
		endSec = 0
	}
	offsetSec, _ := strconv.ParseInt(offsetSecStr, 10, 64)
	if offsetSec < 0 {
		offsetSec = 0
	}
	speed, _ := strconv.ParseInt(speedStr, 10, 64)
	if speed <= 0 {
		speed = 1
	}
	chNum, _ := strconv.ParseInt(channel, 10, 64)
	if chNum < 0 {
		chNum = 0
	}

	normCh := NormalizeChannel(c.model, uint32(chNum))
	fileStartSec, resolvedOffset := c.resolvePlaybackTarget(normCh, startSec, offsetSec)
	c.lastPlaybackSession.Store(fileStartSec)

	// isa.camera.hlc7 requires MISS_CMD_VIDEO_START (0x102) with {} before MISS_CMD_PLAYBACK_REQ (0x10D)
	if c.model == "isa.camera.hlc7" {
		vStart := binary.BigEndian.AppendUint32(nil, cmdVideoStart)
		vStart = append(vStart, `{}`...)
		_ = c.WriteCommand(vStart)
		time.Sleep(60 * time.Millisecond)
	}

	data := binary.BigEndian.AppendUint32(nil, cmdPlaybackReq)
	if c.model == "xiaomi.camera.cw701" {
		pbCh := int64(normCh)
		data = fmt.Appendf(
			data,
			`{"sessionid":%d,"starttime":[%d],"endtime":[0],"autoswitchtolive":0,"offset":[%d],"speed":[%d],"avchannelmerge":1,"channel":[%d]}`,
			fileStartSec, fileStartSec, resolvedOffset, speed, pbCh,
		)
	} else if c.model == "isa.camera.hlc7" {
		// This firmware needs live mode armed before it accepts SD playback.
		// The producer must wait for a positive filefound acknowledgement.
		data = fmt.Appendf(
			data,
			`{"sessionid":%d,"starttime":%d,"endtime":0,"autoswitchtolive":1,"offset":%d,"speed":%d,"avchannelmerge":1}`,
			fileStartSec, fileStartSec, resolvedOffset, speed,
		)
	} else {
		data = fmt.Appendf(
			data,
			`{"sessionid":%d,"starttime":%d,"endtime":0,"autoswitchtolive":0,"offset":%d,"speed":%d,"avchannelmerge":1}`,
			fileStartSec, fileStartSec, resolvedOffset, speed,
		)
	}
	debugLog("StartPlayback did=%s model=%s reqStart=%d resolvedFileStart=%d resolvedOffset=%d ch=%d json=%s", c.did, c.model, startSec, fileStartSec, resolvedOffset, normCh, string(data[4:]))
	if err := c.WriteCommand(data); err != nil {
		debugLog("StartPlayback WriteCommand err=%v", err)
		return err
	}
	time.Sleep(50 * time.Millisecond)
	_ = c.StartAudio()
	return nil
}

func (c *Client) SetPlaybackSpeed(speed int) error {
	if speed <= 0 {
		speed = 1
	}
	sess := c.lastPlaybackSession.Load()
	if sess <= 0 {
		sess = time.Now().Unix()
	}
	payload := fmt.Sprintf(`{"sessionid":%d,"entryId":%d,"speed":%d}`, sess, sess, speed)
	return c.SendRawCommand(cmdPlaybackSetSpeed, payload)
}

func (c *Client) LastPlaybackStatus() string {
	if v := c.lastPlaybackStatus.Load(); v != nil {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

func (c *Client) StopMedia() error {
	if c.playbackMode {
		ctrl := binary.BigEndian.AppendUint32(nil, cmdStreamCtrlReq)
		ctrl = append(ctrl, `{"operation":3}`...)
		_ = c.WriteCommand(ctrl)
	}
	data := binary.BigEndian.AppendUint32(nil, cmdVideoStop)
	return c.WriteCommand(data)
}

func (c *Client) StartAudio() error {
	data := binary.BigEndian.AppendUint32(nil, cmdAudioStart)
	data = append(data, `{}`...)
	return c.WriteCommand(data)
}

func (c *Client) touchSpeakerLocked() {
	if c.speakerTimer != nil {
		c.speakerTimer.Stop()
	}
	c.speakerTimer = time.AfterFunc(8*time.Second, func() {
		_ = c.StopSpeaker()
	})
}

func (c *Client) StartSpeaker() error {
	c.speakerMu.Lock()
	alreadyOn := c.speakerOn
	c.speakerOn = true
	c.touchSpeakerLocked()
	c.speakerMu.Unlock()

	if alreadyOn {
		return nil
	}

	data := binary.BigEndian.AppendUint32(nil, cmdSpeakerStartReq)
	data = append(data, `{}`...)
	if err := c.WriteCommand(data); err != nil {
		c.speakerMu.Lock()
		c.speakerOn = false
		c.speakerMu.Unlock()
		return err
	}
	time.Sleep(80 * time.Millisecond)
	return nil
}

func (c *Client) StopSpeaker() error {
	c.speakerMu.Lock()
	if c.speakerTimer != nil {
		c.speakerTimer.Stop()
		c.speakerTimer = nil
	}
	if !c.speakerOn {
		c.speakerMu.Unlock()
		return nil
	}
	c.speakerOn = false
	c.speakerMu.Unlock()

	data := binary.BigEndian.AppendUint32(nil, cmdSpeakerStop)
	data = append(data, `{}`...)
	return c.WriteCommand(data)
}

// SpeakerCodec returns the camera model's two-way audio codec.
func (c *Client) SpeakerCodec() uint32 {
	switch c.model {
	case ModelDafang, ModelXiaofang, "isa.camera.hlc6":
		return codecPCM
	case "chuangmi.camera.72ac1", "xiaomi.camera.cw701", "mxiang.camera.mod11":
		return codecOPUS
	case "isa.camera.hlc7":
		return codecPCMA
	}
	if inCodec := c.inAudioCodec.Load(); inCodec != 0 {
		return inCodec
	}
	return codecPCMA
}

const hdrSize = 32

func (c *Client) ReadPacket() (*Packet, error) {
	hdr, payload, err := c.Conn.ReadPacket()
	if err != nil {
		return nil, fmt.Errorf("miss: read media: %w", err)
	}

	if len(hdr) < hdrSize {
		return nil, fmt.Errorf("miss: packet header too small")
	}

	payload, err = crypto.Decode(payload, c.key)
	if err != nil {
		return nil, err
	}

	pkt := &Packet{
		CodecID:  binary.LittleEndian.Uint32(hdr[4:]),
		Sequence: binary.LittleEndian.Uint32(hdr[8:]),
		Flags:    binary.LittleEndian.Uint32(hdr[12:]),
		Payload:  payload,
	}

	if pkt.CodecID == codecPCMA || pkt.CodecID == codecOPUS || pkt.CodecID == codecPCM || pkt.CodecID == codecPCMU {
		c.inAudioCodec.Store(pkt.CodecID)
		if pkt.Flags != 0 {
			c.inAudioFlags.Store(pkt.Flags)
		}
	}

	switch c.model {
	case ModelDafang, ModelXiaofang, ModelLoockV2:
		// Dafang has ts in sec
		// LoockV2 has ts in msec for video, but zero ts for audio
		pkt.Timestamp = uint64(time.Now().UnixMilli())
	default:
		pkt.Timestamp = binary.LittleEndian.Uint64(hdr[16:])
	}

	return pkt, nil
}

func (c *Client) WriteAudio(codecID uint32, payload []byte) error {
	c.speakerMu.Lock()
	if c.speakerOn {
		c.touchSpeakerLocked()
	}
	c.speakerMu.Unlock()

	payload, err := crypto.Encode(payload, c.key) // new payload will have new size!
	if err != nil {
		return err
	}

	n := uint32(len(payload))
	seq := c.audioSeq.Add(1)
	flags := c.inAudioFlags.Load()
	if flags == 0 {
		if codecID == codecOPUS {
			flags = 1 << 3 // 16kHz/48kHz audio flag
		}
	}

	header := make([]byte, hdrSize)
	binary.LittleEndian.PutUint32(header[0:], n)
	binary.LittleEndian.PutUint32(header[4:], codecID)
	binary.LittleEndian.PutUint32(header[8:], seq)
	binary.LittleEndian.PutUint32(header[12:], flags)
	binary.LittleEndian.PutUint64(header[16:], uint64(time.Now().UnixMilli()))
	return c.Conn.WritePacket(header, payload)
}

func (c *Client) queryRDT6Once(cs2Conn *cs2.Conn, req []byte) ([]byte, error) {
	// Drain any stale RDT packets before issuing request
	for {
		if _, err := cs2Conn.ReadRDT(5 * time.Millisecond); err != nil {
			break
		}
	}

	encReq, err := crypto.Encode(req, c.key)
	if err != nil {
		return nil, err
	}
	if err := cs2Conn.WriteRDT(encReq); err != nil {
		return nil, err
	}

	var rawBuf []byte
	totalExpected := -1
	deadline := time.Now().Add(3500 * time.Millisecond)

	for time.Now().Before(deadline) {
		waitDur := 950 * time.Millisecond
		if totalExpected > 0 && len(rawBuf) > 0 {
			waitDur = 600 * time.Millisecond
		}
		chunk, err := cs2Conn.ReadRDT(waitDur)
		if err != nil || len(chunk) == 0 {
			break
		}
		if decChunk, decErr := crypto.Decode(chunk, c.key); decErr == nil && len(decChunk) > 0 {
			chunk = decChunk
		}
		if totalExpected < 0 && len(chunk) >= 12 {
			cmdId := binary.LittleEndian.Uint32(chunk[0:4])
			tot := int(binary.LittleEndian.Uint32(chunk[4:8]))
			if cmdId == 6 && tot >= 0 && tot <= 16*1024*1024 {
				totalExpected = tot
				rawBuf = append(rawBuf, chunk[12:]...)
				if totalExpected == 0 || len(rawBuf) >= totalExpected {
					break
				}
				continue
			}
		}
		rawBuf = append(rawBuf, chunk...)
		if totalExpected >= 0 && len(rawBuf) >= totalExpected {
			break
		}
	}

	if totalExpected > 0 && len(rawBuf) > totalExpected {
		rawBuf = rawBuf[:totalExpected]
	}
	return rawBuf, nil
}

func (c *Client) QuerySDCatalog(channel uint32) ([]SDCatalogItem, error) {
	cs2Conn, ok := c.Conn.(*cs2.Conn)
	if !ok {
		return nil, fmt.Errorf("miss: RDT catalog only supported on cs2 transport")
	}

	c.rdtMu.Lock()
	defer c.rdtMu.Unlock()

	normCh := NormalizeChannel(c.model, channel)

	var candidateReqs [][]byte
	if c.model == "xiaomi.camera.cw701" {
		req32 := make([]byte, 32)
		binary.LittleEndian.PutUint32(req32[0:4], 6)
		binary.LittleEndian.PutUint32(req32[16:20], normCh)
		candidateReqs = append(candidateReqs, req32)
	} else {
		// mxiang.camera.mod11 & isa.camera.hlc7 use 20-byte RDT cmd 6 with data[4]=4 or data[4]=0
		req20a := make([]byte, 20)
		binary.LittleEndian.PutUint32(req20a[0:4], 6)
		binary.LittleEndian.PutUint32(req20a[16:20], 4)
		req20b := make([]byte, 20)
		binary.LittleEndian.PutUint32(req20b[0:4], 6)
		binary.LittleEndian.PutUint32(req20b[16:20], 0)
		req32 := make([]byte, 32)
		binary.LittleEndian.PutUint32(req32[0:4], 6)
		binary.LittleEndian.PutUint32(req32[16:20], normCh)
		candidateReqs = append(candidateReqs, req20a, req20b, req32)
	}

	var rawBuf []byte
	var lastErr error
	for _, req := range candidateReqs {
		buf, err := c.queryRDT6Once(cs2Conn, req)
		if err != nil {
			lastErr = err
		}
		if len(buf) >= 8 {
			rawBuf = buf
			break
		}
	}

	if len(rawBuf) < 8 {
		return nil, lastErr
	}

	var items []SDCatalogItem
	for off := 0; off+8 <= len(rawBuf); off += 8 {
		ts := binary.LittleEndian.Uint32(rawBuf[off : off+4])
		dur := rawBuf[off+4]
		motion := rawBuf[off+5]
		save := rawBuf[off+6]
		isDeleting := rawBuf[off+7]
		if isDeleting == 0 && ts > 1577836800 && ts < 2208988800 {
			if dur == 0 || dur > 180 {
				dur = 60
			}
			items = append(items, SDCatalogItem{
				StartTime: ts,
				EndTime:   ts + uint32(dur),
				Duration:  dur,
				Motion:    motion,
				Save:      save,
			})
		}
	}

	if len(items) > 0 {
		setCachedSDCatalog(c.did, normCh, items)
	}
	return items, nil
}

type Packet struct {
	//Length    uint32
	CodecID   uint32
	Sequence  uint32
	Flags     uint32
	Timestamp uint64 // msec
	//TimestampS uint32
	//Reserved uint32
	Payload []byte
}

func (p *Packet) SampleRate() uint32 {
	// flag:         1 0011 000 - sample rate 16000
	// flag: 100 00 01 0000 000 - sample rate  8000
	v := (p.Flags >> 3) & 0b1111
	if v != 0 {
		return 16000
	}
	return 8000
}

//func (p *Packet) AudioUnknown1() byte {
//	return byte((p.Flags >> 7) & 0b11)
//}
//
//func (p *Packet) AudioUnknown2() byte {
//	return byte((p.Flags >> 9) & 0b11)
//}

func dafangRaw(cmd uint32, args ...byte) []byte {
	payload := tutk.ICAM(cmd, args...)

	data := make([]byte, 4+len(payload)*2)
	copy(data, "\x7f\xff\xff\xff")
	hex.Encode(data[4:], payload)
	return data
}

// DafangVideoQuality 0 - hd, 1 - sd
func dafangVideoQuality(quality uint8) []byte {
	return dafangRaw(0xff07d5, quality)
}

func dafangVideoStart(video, audio uint8) []byte {
	return dafangRaw(0xff07d8, video, audio)
}

//func dafangLeft() []byte {
//	return dafangRaw(0xff2404, 2, 0, 5)
//}
//
//func dafangRight() []byte {
//	return dafangRaw(0xff2404, 1, 0, 5)
//}
//
//func dafangUp() []byte {
//	return dafangRaw(0xff2404, 0, 2, 5)
//}
//
//func dafangDown() []byte {
//	return dafangRaw(0xff2404, 0, 1, 5)
//}
//
//func dafangStop() []byte {
//	return dafangRaw(0xff2404, 0, 0, 5)
//}
