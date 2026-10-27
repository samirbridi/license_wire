package main

import (
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"

	"github.com/AlexxIT/go2rtc/pkg/xiaomi"
)

type propertyRead struct {
	DID  string `json:"did"`
	SIID int    `json:"siid"`
	PIID int    `json:"piid"`
}

func storageService(model string) (int, error) {
	switch model {
	case "xiaomi.camera.cw701", "isa.camera.hlc7":
		return 4, nil
	case "mxiang.camera.mod11":
		return 3, nil
	default:
		return 0, errors.New("unsupported registered model")
	}
}

func allowedOperation(operation string) error {
	if operation == "storage-status" || operation == "positions" {
		return nil
	}
	_, err := requestBytes(operation)
	return err
}

// Fixed GET-property lists from the published model specifications.
// No actions (including format/eject/calibrate), setters or arbitrary RPCs.
func propertyReads(u *url.URL, operation string) ([]propertyRead, error) {
	did, model := u.Query().Get("did"), u.Query().Get("model")
	if did == "" {
		return nil, errors.New("registered device identifier missing")
	}
	if operation == "storage-status" {
		siid, err := storageService(model)
		if err != nil {
			return nil, err
		}
		return []propertyRead{{did, siid, 1}, {did, siid, 2}, {did, siid, 3}, {did, siid, 4}}, nil
	}
	if operation == "positions" && model == "xiaomi.camera.cw701" {
		return []propertyRead{{did, 9, 1}, {did, 9, 2}, {did, 10, 7}}, nil
	}
	return nil, errors.New("read operation unavailable for this model")
}

func readCloudProperties(u *url.URL, token, operation string, receipt map[string]any) error {
	params, err := propertyReads(u, operation)
	if err != nil {
		return err
	}
	receipt["stage"] = "authenticate-cloud-read"
	cloud := xiaomi.NewCloud("xiaomiio")
	if err = cloud.LoginWithToken(u.User.Username(), token); err != nil {
		return err
	}
	request, _ := json.Marshal(map[string]any{"params": params})
	receipt["stage"] = "read-fixed-properties"
	body, err := cloud.Request("https://api.io.mi.com/app", "/miotspec/prop/get", string(request), nil)
	if err != nil {
		return err
	}
	receipt["requestSent"] = true
	receipt["responseHex"] = hex.EncodeToString(body) // removed from public output
	receipt["transport"] = "xiaomi-cloud-https"
	var rows []struct {
		DID   string          `json:"did"`
		SIID  int             `json:"siid"`
		PIID  int             `json:"piid"`
		Code  int             `json:"code"`
		Value json.RawMessage `json:"value"`
	}
	if err = json.Unmarshal(body, &rows); err != nil {
		return err
	}
	if len(rows) != len(params) {
		return errors.New("unexpected property response count")
	}
	seen := map[string]bool{}
	status := []map[string]any{}
	storage := map[string]any{"unit": nil}
	allOK := true
	for _, row := range rows {
		matched := false
		for _, p := range params {
			if p.DID == row.DID && p.SIID == row.SIID && p.PIID == row.PIID {
				matched = true
				break
			}
		}
		key := fmt.Sprintf("%d.%d", row.SIID, row.PIID)
		if !matched || seen[key] {
			return errors.New("unexpected or duplicate property response")
		}
		seen[key] = true
		item := map[string]any{"siid": row.SIID, "piid": row.PIID, "code": row.Code}
		if row.Code != 0 {
			allOK = false
			status = append(status, item)
			continue
		}
		if operation == "storage-status" {
			var value int64
			if err = json.Unmarshal(row.Value, &value); err != nil || value < 0 {
				return errors.New("invalid storage property value")
			}
			names := map[int]string{1: "status", 2: "totalRaw", 3: "freeRaw", 4: "usedRaw"}
			storage[names[row.PIID]] = value
		} else {
			// Position labels/angles stay in the private response until their
			// schema is validated; only type/length is published by this probe.
			var value any
			if err = json.Unmarshal(row.Value, &value); err != nil {
				return err
			}
			item["valueType"] = fmt.Sprintf("%T", value)
			if s, ok := value.(string); ok {
				item["stringBytes"] = len(s)
				item["validJSON"] = json.Valid([]byte(s))
			}
		}
		status = append(status, item)
	}
	receipt["properties"] = status
	if operation == "storage-status" {
		receipt["storage"] = storage
	}
	if !allOK {
		return errors.New("camera returned one or more property errors")
	}
	receipt["stage"] = "expected-properties-received"
	return nil
}
