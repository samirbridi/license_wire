package main

import (
	"encoding/json"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestReadListsMatchPublishedModelSchemas(t *testing.T) {
	for _, model := range []string{"xiaomi.camera.cw701", "mxiang.camera.mod11", "isa.camera.hlc7"} {
		data, err := os.ReadFile(filepath.Join("../../evidence/miot-spec", model+".json"))
		if err != nil {
			t.Fatal(err)
		}
		var spec struct {
			Services []struct {
				IID        int `json:"iid"`
				Properties []struct {
					IID    int      `json:"iid"`
					Type   string   `json:"type"`
					Access []string `json:"access"`
				} `json:"properties"`
			} `json:"services"`
		}
		if err = json.Unmarshal(data, &spec); err != nil {
			t.Fatal(err)
		}
		u, _ := url.Parse("xiaomi://owner:cn@192.168.1.2?did=test-device&model=" + model)
		operations := []string{"storage-status"}
		if model == "xiaomi.camera.cw701" {
			operations = append(operations, "positions")
		}
		for _, operation := range operations {
			reads, err := propertyReads(u, operation)
			if err != nil {
				t.Fatal(err)
			}
			for _, read := range reads {
				found := false
				for _, service := range spec.Services {
					if service.IID != read.SIID {
						continue
					}
					for _, property := range service.Properties {
						if property.IID == read.PIID && strings.Contains(","+strings.Join(property.Access, ",")+",", ",read,") {
							found = true
						}
					}
				}
				if !found {
					t.Fatalf("%s %s reads undocumented property %d.%d", model, operation, read.SIID, read.PIID)
				}
			}
		}
	}
}

func TestOperationsRejectWritesAndUnknownModels(t *testing.T) {
	for _, operation := range []string{"format", "eject", "set", "move", "restart", "calibrate", "delete", ""} {
		if allowedOperation(operation) == nil {
			t.Fatalf("write/unknown operation accepted: %s", operation)
		}
	}
	u, _ := url.Parse("xiaomi://owner:cn@192.168.1.2?did=test-device&model=unknown")
	if _, err := propertyReads(u, "storage-status"); err == nil {
		t.Fatal("unknown model accepted")
	}
}
