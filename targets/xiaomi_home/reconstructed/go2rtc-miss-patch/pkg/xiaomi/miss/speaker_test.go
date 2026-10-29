package miss

import "testing"

func TestSpeakerAnswerFollowsOfficialPlugin(t *testing.T) {
	// The plugin opens the channel on "0" (byte 48) and reports "channel_is_occupied" on '-' (byte 45).
	if ok, known := speakerAnswer("0"); !ok || !known {
		t.Fatal(`"0" must open the channel`)
	}
	if ok, known := speakerAnswer("-1"); ok || !known {
		t.Fatal(`"-1" must report an occupied channel`)
	}
	if _, known := speakerAnswer(""); known {
		t.Fatal("no answer must not be treated as a refusal")
	}
}
