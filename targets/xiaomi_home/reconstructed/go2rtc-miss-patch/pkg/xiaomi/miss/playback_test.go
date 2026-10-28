package miss

import (
 "encoding/binary"
 "encoding/json"
 "testing"
 "github.com/AlexxIT/go2rtc/pkg/xiaomi/crypto"
)

type playbackCapture struct{ Conn; packets [][]byte }
func (c *playbackCapture) WriteCommand(_ uint32, data []byte) error {c.packets=append(c.packets,append([]byte(nil),data...));return nil}

func TestPlaybackDoesNotFallBackToLive(t *testing.T){
 for _,model:=range []string{"xiaomi.camera.cw701","mxiang.camera.mod11","isa.camera.hlc7"}{
  t.Run(model,func(t *testing.T){
   capture:=&playbackCapture{};key:=make([]byte,32)
   client:=&Client{Conn:capture,key:key,model:model}
   if err:=client.StartPlayback("10","1793102480","0","5","1");err!=nil{t.Fatal(err)}
   found:=false
   for _,packet:=range capture.packets{
    plain,err:=crypto.Decode(packet,key);if err!=nil{t.Fatal(err)}
    if len(plain)<4||binary.BigEndian.Uint32(plain[:4])!=cmdPlaybackReq{continue}
    var request map[string]any;if err=json.Unmarshal(plain[4:],&request);err!=nil{t.Fatal(err)}
    if request["autoswitchtolive"]!=float64(0){t.Fatal("SD replay may switch to live video")};found=true
   }
   if !found{t.Fatal("playback command missing")}
  })
 }
}
