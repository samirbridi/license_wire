// Camera-owner diagnostic. Only one fixed read request is enabled.
// Transport: MIT-licensed AlexxIT/go2rtc; vendor protocol facts are documented
// separately. This program does not start media, move motors or write an SD card.
package main

import (
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode"

	"github.com/AlexxIT/go2rtc/pkg/xiaomi"
	"github.com/AlexxIT/go2rtc/pkg/xiaomi/crypto"
	"github.com/AlexxIT/go2rtc/pkg/xiaomi/miss"
	"gopkg.in/yaml.v3"
)

var sourceCommit = "development"

type camera struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}
type source struct {
	Name string `json:"name"`
	URL  string `json:"url"`
}

func normalized(s string) string {
	return strings.Map(func(r rune) rune {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			return unicode.ToLower(r)
		}
		return -1
	}, s)
}
func inTarget(root, path string) bool {
	absolute, err := filepath.Abs(path)
	return err == nil && strings.HasPrefix(strings.ToLower(absolute), strings.ToLower(root+string(os.PathSeparator)))
}
func readJSON(path string, value any) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	data = []byte(strings.TrimPrefix(string(data), "\ufeff"))
	return json.Unmarshal(data, value)
}

func ownerSource(root, id string) (*url.URL, string, error) {
	var cameras []camera
	if err := readJSON(filepath.Join(root, "runtime/central/cameras.json"), &cameras); err != nil {
		return nil, "", err
	}
	var selected *camera
	for _, c := range cameras {
		if c.ID == id {
			copy := c
			selected = &copy
			break
		}
	}
	if selected == nil {
		return nil, "", errors.New("camera not registered")
	}
	var inventory struct {
		Sources []source `json:"sources"`
	}
	if err := readJSON(filepath.Join(root, "evidence/private/camera-sources-cn.json"), &inventory); err != nil {
		return nil, "", err
	}
	var u *url.URL
	for _, s := range inventory.Sources {
		if normalized(s.Name) == normalized(selected.Name) {
			var err error
			u, err = url.Parse(s.URL)
			if err != nil {
				return nil, "", err
			}
			break
		}
	}
	if u == nil || u.Scheme != "xiaomi" || u.User == nil || u.Query().Get("model") != "xiaomi.camera.cw701" {
		return nil, "", errors.New("only the registered CW701 is supported")
	}
	ip := net.ParseIP(u.Hostname())
	if ip == nil || !ip.IsPrivate() {
		return nil, "", errors.New("registered camera must be local")
	}
	region, _ := u.User.Password()
	if region != "cn" {
		return nil, "", errors.New("only registered China region is supported")
	}
	var metadata struct {
		Config string `json:"config"`
	}
	if err := readJSON(filepath.Join(root, "runtime/qr-login/process.json"), &metadata); err != nil {
		return nil, "", err
	}
	if !inTarget(root, metadata.Config) {
		return nil, "", errors.New("configuration outside target")
	}
	data, err := os.ReadFile(metadata.Config)
	if err != nil {
		return nil, "", err
	}
	var config struct {
		Xiaomi map[string]string `yaml:"xiaomi"`
	}
	if err = yaml.Unmarshal(data, &config); err != nil {
		return nil, "", err
	}
	token := config.Xiaomi[u.User.Username()]
	if token == "" {
		return nil, "", errors.New("owner authorization unavailable")
	}
	return u, token, nil
}

func resolveSession(u *url.URL, token string) (*url.URL, error) {
	cloud := xiaomi.NewCloud("xiaomiio")
	if err := cloud.LoginWithToken(u.User.Username(), token); err != nil {
		return nil, err
	}
	public, private, err := crypto.GenerateKey()
	if err != nil {
		return nil, err
	}
	params, _ := json.Marshal(map[string]string{"app_pubkey": hex.EncodeToString(public), "did": u.Query().Get("did"), "support_vendors": "TUTK_CS2_MTP"})
	body, err := cloud.Request("https://api.io.mi.com/app", "/v2/device/miss_get_vendor", string(params), nil)
	if err != nil {
		return nil, err
	}
	var result struct {
		Vendor struct {
			ID     byte `json:"vendor"`
			Params struct {
				UID string `json:"p2p_id"`
			} `json:"vendor_params"`
		} `json:"vendor"`
		PublicKey string `json:"public_key"`
		Sign      string `json:"sign"`
	}
	if err = json.Unmarshal(body, &result); err != nil {
		return nil, err
	}
	var vendor string
	switch result.Vendor.ID {
	case 1:
		vendor = "tutk"
	case 4:
		vendor = "cs2"
	default:
		return nil, errors.New("unsupported read transport")
	}
	q := u.Query()
	q.Set("vendor", vendor)
	q.Set("client_public", hex.EncodeToString(public))
	q.Set("client_private", hex.EncodeToString(private))
	q.Set("device_public", result.PublicKey)
	q.Set("sign", result.Sign)
	if vendor == "tutk" {
		q.Set("uid", result.Vendor.Params.UID)
	}
	clone := *u
	clone.RawQuery = q.Encode()
	return &clone, nil
}

func requestBytes(operation string) ([]byte, error) {
	switch operation {
	case "device-info":
		data := make([]byte, 6)
		// MISS request prefix is big-endian; the vendor HL body uses little-endian.
		binary.BigEndian.PutUint32(data, 0x110)
		copy(data[4:], []byte("{}"))
		return data, nil
	default:
		return nil, errors.New("only the fixed device-info read is enabled")
	}
}

// Protocol fact only. Native outer framing must be validated before transmission.
func cruiseProtocolBytes() []byte {
	data := make([]byte, 16)
	copy(data, []byte{'H', 'L'})
	binary.LittleEndian.PutUint16(data[2:], 5)
	binary.LittleEndian.PutUint16(data[4:], 9200)
	return data
}

func connectWithTimeout(rawURL string) (*miss.Client, error) {
	type result struct {
		client *miss.Client
		err    error
	}
	ready, cancelled := make(chan result), make(chan struct{})
	defer close(cancelled)
	go func() {
		client, err := miss.NewClient(rawURL)
		select {
		case ready <- result{client, err}:
		case <-cancelled:
			if client != nil {
				_ = client.Close()
			}
		}
	}()
	timer := time.NewTimer(16 * time.Second)
	defer timer.Stop()
	select {
	case value := <-ready:
		return value.client, value.err
	case <-timer.C:
		return nil, errors.New("read connection deadline exceeded")
	}
}

func run(root, id, operation string, receipt map[string]any) error {
	receipt["stage"] = "load-owner-config"
	payload, err := requestBytes(operation)
	if err != nil {
		return err
	}
	u, token, err := ownerSource(root, id)
	if err != nil {
		return err
	}
	receipt["stage"] = "resolve-read-session"
	resolved, err := resolveSession(u, token)
	if err != nil {
		return err
	}
	receipt["stage"] = "connect-read-session"
	client, err := connectWithTimeout(resolved.String())
	if err != nil {
		return err
	}
	defer client.Close()
	receipt["transport"] = client.Protocol()
	key, err := crypto.CalcSharedKey(resolved.Query().Get("device_public"), resolved.Query().Get("client_private"))
	if err != nil {
		return err
	}
	if err = client.SetDeadline(time.Now().Add(8 * time.Second)); err != nil {
		return err
	}
	receipt["stage"] = "send-fixed-read"
	if err = client.WriteCommand(payload); err != nil {
		return err
	}
	receipt["requestSent"] = true
	receipt["stage"] = "read-response"
	for i := 0; i < 8; i++ {
		command, data, readErr := client.ReadCommand()
		if readErr != nil {
			return readErr
		}
		observed, _ := receipt["observedCommands"].([]uint32)
		receipt["observedCommands"] = append(observed, command)
		if command == 0x111 {
			receipt["responseBytes"] = len(data)
			receipt["responseHex"] = hex.EncodeToString(data)
			receipt["stage"] = "expected-response-received"
			return nil
		}
		if command != 0x1001 {
			continue
		}
		decoded, decodeErr := crypto.Decode(data, key)
		if decodeErr != nil {
			return decodeErr
		}
		receipt["outerCommand"] = command
		receipt["responseBytes"] = len(decoded)
		receipt["responseHex"] = hex.EncodeToString(decoded)
		matches := false
		if len(decoded) >= 4 {
			receipt["innerCommandLE"] = binary.LittleEndian.Uint32(decoded[:4])
			receipt["innerCommandBE"] = binary.BigEndian.Uint32(decoded[:4])
			matches = binary.BigEndian.Uint32(decoded[:4]) == 0x111 || binary.LittleEndian.Uint32(decoded[:4]) == 0x111
		}
		if !matches {
			continue
		}
		receipt["responseHex"] = hex.EncodeToString(decoded)
		receipt["stage"] = "expected-response-received"
		return nil
	}
	return errors.New("no encoded control response received")
}

func main() {
	target := flag.String("target", "", "absolute Xiaomi target directory")
	id := flag.String("camera", "outdoor_pro_poste", "registered camera ID")
	operation := flag.String("read", "device-info", "device-info only; position framing remains under analysis")
	flag.Parse()
	if _, check := requestBytes(*operation); check != nil {
		fmt.Println(`{"status":"read_operation_not_allowed"}`)
		os.Exit(2)
	}
	root, err := filepath.Abs(*target)
	if err != nil || *target == "" {
		fmt.Println(`{"status":"target_required"}`)
		os.Exit(2)
	}
	output := os.Stdout
	logPath := filepath.Join(root, "evidence/private", fmt.Sprintf("readonly-transport-%d.log", time.Now().UnixMilli()))
	privateLog, logErr := os.OpenFile(logPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if logErr != nil {
		fmt.Fprintln(output, `{"status":"private_log_unavailable"}`)
		os.Exit(2)
	}
	defer privateLog.Close()
	// The dependency can print raw packets. Keep its stdout private throughout.
	os.Stdout = privateLog
	receipt := map[string]any{"observedAt": time.Now().UTC().Format(time.RFC3339), "sourceCommit": sourceCommit, "camera": *id, "operation": *operation, "readOnly": true, "mediaStarted": false, "requestSent": false}
	err = run(root, *id, *operation, receipt)
	receipt["pass"] = err == nil
	if err != nil {
		receipt["errorType"] = fmt.Sprintf("%T", err)
		// Detailed network errors can contain private endpoints. Keep them only
		// in the local diagnostic log; publish bounded classifications instead.
		fmt.Fprintln(privateLog, err.Error())
		var networkError *net.OpError
		if errors.As(err, &networkError) {
			receipt["networkOperation"] = networkError.Op
			receipt["networkTransport"] = networkError.Net
			receipt["networkTimeout"] = networkError.Timeout()
		}
	}
	destination := filepath.Join(root, "evidence/private", fmt.Sprintf("readonly-%s-%d.json", *operation, time.Now().UnixMilli()))
	if !inTarget(root, destination) {
		os.Exit(2)
	}
	data, _ := json.MarshalIndent(receipt, "", "  ")
	_ = os.WriteFile(destination, data, 0600)
	delete(receipt, "responseHex")
	summary, _ := json.Marshal(receipt)
	fmt.Fprintln(output, string(summary))
	if err != nil {
		os.Exit(1)
	}
}
