package cs2

import (
	"bytes"
	"net"
	"testing"
)

type recordConn struct {
	net.Conn
	writes [][]byte
	closed bool
}

func (r *recordConn) Write(b []byte) (int, error) {
	r.writes = append(r.writes, append([]byte(nil), b...))
	return len(b), nil
}

func (r *recordConn) Close() error { r.closed = true; return nil }

func TestCloseNotifiesCamera(t *testing.T) {
	for _, tcp := range []bool{false, true} {
		rec := &recordConn{}
		c := &Conn{Conn: rec, isTCP: tcp}
		if err := c.Close(); err != nil {
			t.Fatal(err)
		}
		want := 3
		if tcp {
			want = 1
		}
		if !rec.closed || len(rec.writes) != want {
			t.Fatalf("tcp=%v: closed=%v writes=%d", tcp, rec.closed, len(rec.writes))
		}
		for _, w := range rec.writes {
			if !bytes.Equal(w, []byte{magic, msgClose, 0, 0}) {
				t.Fatalf("unexpected close message %x", w)
			}
		}
	}
}
