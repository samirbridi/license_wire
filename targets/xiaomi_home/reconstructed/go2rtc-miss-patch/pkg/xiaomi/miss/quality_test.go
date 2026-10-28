package miss

import (
	"github.com/AlexxIT/go2rtc/pkg/core"
	"testing"
)

func TestRequestedRecordingQualityRejectsInitial360p(t *testing.T) {
	// Public go2rtc H.265 SPS fixtures: 640x360 and 5120x1440.
	low := &core.Codec{Name: core.CodecH265, FmtpLine: "sprop-sps=QgEBIUAAAAMAkAAAAwAAAwCWoAUCAWlnpbkShc1AQIC4QAAAAwBAAAAFFEn/eEAOpgAV+V8IBBA="}
	high := &core.Codec{Name: core.CodecH265, FmtpLine: "sprop-sps=QgEBAWAAAAMAAAMAAAMAAAMAmaAAoAgBaH+KrTuiS7/8AAQABbAgApMuADN/mAE="}
	if qualifiedVideo(low, 2304) {
		t.Fatal("stale 360p stream accepted as 2K")
	}
	if !qualifiedVideo(high, 2304) {
		t.Fatal("requested resolution rejected")
	}
	if !qualifiedVideo(low, 0) {
		t.Fatal("ordinary preview behavior changed")
	}
	if qualifiedVideo(nil, 2304) || qualifiedVideo(&core.Codec{Name: core.CodecH265}, 2304) {
		t.Fatal("missing codec metadata accepted")
	}
}
