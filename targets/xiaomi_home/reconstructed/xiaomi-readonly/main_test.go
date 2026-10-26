package main

import (
	"encoding/hex"
	"path/filepath"
	"testing"
)

func TestReadWireFixtures(t *testing.T) {
	fixtures := map[string]string{"device-info": "000001107b7d"}
	for operation, want := range fixtures {
		data, err := requestBytes(operation)
		if err != nil || hex.EncodeToString(data) != want {
			t.Fatalf("%s differs from documented read fixture", operation)
		}
	}
	if hex.EncodeToString(cruiseProtocolBytes()) != "484c0500f02300000000000000000000" {
		t.Fatal("HL read fixture differs from plugin evidence")
	}
	for _, operation := range []string{"cruise-positions", "set-motor", "format", "delete", "", "../outside"} {
		if _, err := requestBytes(operation); err == nil {
			t.Fatalf("unexpected operation accepted: %s", operation)
		}
	}
}

func TestScopedPrivatePaths(t *testing.T) {
	root, _ := filepath.Abs("test-target")
	if !inTarget(root, filepath.Join(root, "runtime", "config.yaml")) {
		t.Fatal("expected private child")
	}
	if inTarget(root, root+"-sibling/config.yaml") {
		t.Fatal("sibling accepted")
	}
}

func TestPhysicalResponseByteOrder(t *testing.T) {
	for command, expected := range map[uint32]uint32{
		17825792: 0x1001, // observed from the actual CW701 through CS2/TCP
		0x1001: 0x1001,
		0x11010000: 0x111,
		0x111: 0x111,
		0x12345678: 0x12345678,
	} {
		if actual := responseCommand(command); actual != expected {
			t.Fatalf("response %#x became %#x, expected %#x", command, actual, expected)
		}
	}
}
