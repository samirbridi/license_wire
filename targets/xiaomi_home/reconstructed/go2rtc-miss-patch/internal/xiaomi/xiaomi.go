package xiaomi

import (
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/AlexxIT/go2rtc/internal/api"
	"github.com/AlexxIT/go2rtc/internal/app"
	"github.com/AlexxIT/go2rtc/internal/streams"
	"github.com/AlexxIT/go2rtc/pkg/core"
	"github.com/AlexxIT/go2rtc/pkg/opus"
	"github.com/AlexxIT/go2rtc/pkg/xiaomi"
	"github.com/AlexxIT/go2rtc/pkg/xiaomi/crypto"
	"github.com/AlexxIT/go2rtc/pkg/xiaomi/miss"
	"github.com/rs/zerolog"
)

func Init() {
	var v struct {
		Cfg map[string]string `yaml:"xiaomi"`
	}
	app.LoadConfig(&v)

	tokens = v.Cfg

	log = app.GetLogger("xiaomi")

	streams.HandleFunc("xiaomi", func(rawURL string) (core.Producer, error) {
		u, err := url.Parse(rawURL)
		if err != nil {
			return nil, err
		}

		did := u.Query().Get("did")
		isPlayback := u.Query().Get("playback") != ""
		dualCamera := miss.DualEnabled(u.Query().Get("model"))
		if isPlayback && did != "" {
			// Block live dials before closing them: the cloud lookup below takes time.
			done := miss.MarkPlaybackPending(did)
			defer done()
		}
		if did != "" {
			closeTempClient(did)
			// Only SD playback takes the camera over; live dials never close a playback (see miss.Dial).
			// Dual-lens cameras switch their one shared connection instead of opening another.
			if isPlayback && !dualCamera {
				miss.CloseClientsForDID(did, false)
			}
		}

		if u.User != nil {
			rawURL, err = getCameraURL(u)
			if err != nil {
				return nil, err
			}
		}

		log.Debug().Msgf("xiaomi: dial %s", rawURL)

		if !isPlayback || did == "" {
			return xiaomi.Dial(rawURL)
		}
		prod, err := xiaomi.Dial(rawURL)
		if err != nil {
			// A live dial already connecting may have won the camera: close it and try once more.
			log.Debug().Msgf("xiaomi: playback retry after %v", err)
			if !dualCamera {
				miss.CloseClientsForDID(did, false)
			}
			time.Sleep(1500 * time.Millisecond)
			prod, err = xiaomi.Dial(rawURL)
		}
		return prod, err
	})

	api.HandleFunc("api/xiaomi", apiXiaomi)
	api.HandleFunc("api/xiaomi/storage", apiXiaomiStorage)
	api.HandleFunc("api/xiaomi/control", apiXiaomiControl)
	api.HandleFunc("api/xiaomi/talkback", apiXiaomiTalkback)
}

var log zerolog.Logger

var tokens map[string]string
var clouds map[string]*xiaomi.Cloud
var cloudsMu sync.Mutex

func getCloud(userID string) (*xiaomi.Cloud, error) {
	cloudsMu.Lock()
	defer cloudsMu.Unlock()

	if cloud := clouds[userID]; cloud != nil {
		return cloud, nil
	}

	cloud := xiaomi.NewCloud(AppXiaomiHome)
	if err := cloud.LoginWithToken(userID, tokens[userID]); err != nil {
		return nil, err
	}
	if clouds == nil {
		clouds = map[string]*xiaomi.Cloud{userID: cloud}
	} else {
		clouds[userID] = cloud
	}
	return cloud, nil
}

func cloudRequest(userID, region, apiURL, params string) ([]byte, error) {
	cloud, err := getCloud(userID)
	if err != nil {
		return nil, err
	}
	return cloud.Request(GetBaseURL(region), apiURL, params, nil)
}

func cloudUserRequest(user *url.Userinfo, apiURL, params string) ([]byte, error) {
	userID := user.Username()
	region, _ := user.Password()
	return cloudRequest(userID, region, apiURL, params)
}

func getCameraURL(url *url.URL) (string, error) {
	model := url.Query().Get("model")

	// It is not known which models need to be awakened.
	// Probably all the doorbells and all the battery cameras.
	if strings.Contains(model, ".cateye.") {
		_ = wakeUpCamera(url)
	}

	// The getMissURL request has a fallback to getP2PURL.
	// But for known models we can save one request to the cloud.
	if xiaomi.IsLegacy(model) {
		return getLegacyURL(url)
	}
	return getMissURL(url)
}

func getLegacyURL(url *url.URL) (string, error) {
	query := url.Query()

	clientPublic, clientPrivate, err := crypto.GenerateKey()
	if err != nil {
		return "", err
	}

	params := fmt.Sprintf(`{"did":"%s","toSignAppData":"%x"}`, query.Get("did"), clientPublic)

	userID := url.User.Username()
	region, _ := url.User.Password()
	res, err := cloudRequest(userID, region, "/device/devicepass", params)
	if err != nil {
		return "", err
	}

	var v struct {
		UID       string `json:"p2p_id"`
		Password  string `json:"password"`
		PublicKey string `json:"p2p_dev_public_key"`
		Sign      string `json:"signForAppData"`
	}
	if err = json.Unmarshal(res, &v); err != nil {
		return "", err
	}

	query.Set("uid", v.UID)

	if v.Sign != "" {
		query.Set("client_public", hex.EncodeToString(clientPublic))
		query.Set("client_private", hex.EncodeToString(clientPrivate))
		query.Set("device_public", v.PublicKey)
		query.Set("sign", v.Sign)
	} else {
		query.Set("password", v.Password)
	}

	url.RawQuery = query.Encode()
	return url.String(), nil
}

func getMissURL(url *url.URL) (string, error) {
	clientPublic, clientPrivate, err := crypto.GenerateKey()
	if err != nil {
		return "", err
	}

	query := url.Query()
	params := fmt.Sprintf(
		`{"app_pubkey":"%x","did":"%s","support_vendors":"TUTK_CS2_MTP"}`,
		clientPublic, query.Get("did"),
	)

	res, err := cloudUserRequest(url.User, "/v2/device/miss_get_vendor", params)
	if err != nil {
		if strings.Contains(err.Error(), "no available vendor support") {
			return getLegacyURL(url)
		}
		return "", err
	}

	var v struct {
		Vendor struct {
			ID     byte `json:"vendor"`
			Params struct {
				UID string `json:"p2p_id"`
			} `json:"vendor_params"`
		} `json:"vendor"`
		PublicKey string `json:"public_key"`
		Sign      string `json:"sign"`
	}
	if err = json.Unmarshal(res, &v); err != nil {
		return "", err
	}

	query.Set("client_public", hex.EncodeToString(clientPublic))
	query.Set("client_private", hex.EncodeToString(clientPrivate))
	query.Set("device_public", v.PublicKey)
	query.Set("sign", v.Sign)
	query.Set("vendor", getVendorName(v.Vendor.ID))

	if v.Vendor.ID == 1 {
		query.Set("uid", v.Vendor.Params.UID)
	}

	url.RawQuery = query.Encode()
	return url.String(), nil
}

func getVendorName(i byte) string {
	switch i {
	case 1:
		return "tutk"
	case 3:
		return "agora"
	case 4:
		return "cs2"
	case 6:
		return "mtp"
	}
	return fmt.Sprintf("%d", i)
}

func wakeUpCamera(url *url.URL) error {
	const params = `{"id":1,"method":"wakeup","params":{"video":"1"}}`
	did := url.Query().Get("did")
	_, err := cloudUserRequest(url.User, "/home/rpc/"+did, params)
	return err
}

func apiXiaomi(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case "GET":
		apiDeviceList(w, r)
	case "POST":
		apiAuth(w, r)
	}
}

func apiDeviceList(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()

	user := query.Get("id")
	if user == "" {
		cloudsMu.Lock()
		users := make([]string, 0, len(tokens))
		for s := range tokens {
			users = append(users, s)
		}
		cloudsMu.Unlock()

		api.ResponseJSON(w, users)
		return
	}

	err := func() error {
		region := query.Get("region")
		res, err := cloudRequest(user, region, "/v2/home/device_list_page", "{}")
		if err != nil {
			return err
		}
		var v struct {
			List []*Device `json:"list"`
		}

		log.Trace().Str("user", user).Msgf("[xiaomi] devices list: %s", res)

		if err = json.Unmarshal(res, &v); err != nil {
			return err
		}

		var items []*api.Source

		for _, device := range v.List {
			if !device.HasCamera() {
				continue
			}
			items = append(items, &api.Source{
				Name: device.Name,
				Info: fmt.Sprintf("ip: %s, mac: %s", device.IP, device.MAC),
				URL:  fmt.Sprintf("xiaomi://%s:%s@%s?did=%s&model=%s", user, region, device.IP, device.Did, device.Model),
			})
		}

		api.ResponseSources(w, items)
		return nil
	}()

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

type Device struct {
	Did   string `json:"did"`
	Name  string `json:"name"`
	Model string `json:"model"`
	MAC   string `json:"mac"`
	IP    string `json:"localip"`
}

func (d *Device) HasCamera() bool {
	return strings.Contains(d.Model, ".camera.") ||
		strings.Contains(d.Model, ".cateye.") ||
		strings.Contains(d.Model, ".feeder.")
}

var auth *xiaomi.Cloud

func apiAuth(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	username := r.Form.Get("username")
	password := r.Form.Get("password")
	captcha := r.Form.Get("captcha")
	verify := r.Form.Get("verify")

	var err error

	switch {
	case username != "" || password != "":
		auth = xiaomi.NewCloud(AppXiaomiHome)
		err = auth.Login(username, password)
	case captcha != "":
		err = auth.LoginWithCaptcha(captcha)
	case verify != "":
		err = auth.LoginWithVerify(verify)
	default:
		http.Error(w, "wrong request", http.StatusBadRequest)
		return
	}

	if err == nil {
		userID, token := auth.UserToken()
		auth = nil

		cloudsMu.Lock()
		if tokens == nil {
			tokens = map[string]string{userID: token}
		} else {
			tokens[userID] = token
		}
		cloudsMu.Unlock()

		err = app.PatchConfig([]string{"xiaomi", userID}, token)
	}

	if err != nil {
		var login *xiaomi.LoginError
		if errors.As(err, &login) {
			w.Header().Set("Content-Type", api.MimeJSON)
			w.WriteHeader(http.StatusUnauthorized)
			_ = json.NewEncoder(w).Encode(err)
			return
		}

		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

const AppXiaomiHome = "xiaomiio"

func GetBaseURL(region string) string {
	switch region {
	case "de", "i2", "ru", "sg", "us":
		return "https://" + region + ".api.io.mi.com/app"
	}
	return "https://api.io.mi.com/app"
}

func defaultRegion(requested string) string {
	r := strings.TrimSpace(requested)
	if r != "" {
		return r
	}
	return "us"
}

func defaultUserID(requested string) string {
	if requested != "" {
		return requested
	}
	cloudsMu.Lock()
	defer cloudsMu.Unlock()
	for uid := range tokens {
		return uid
	}
	return ""
}

type storageCacheEntry struct {
	fetchedAt time.Time
	payload   map[string]any
}

var (
	storageCacheMu sync.Mutex
	storageCache   = map[string]storageCacheEntry{}
	tempClientsMu  sync.Mutex
	tempClients    = map[string]*miss.Client{}
	tempTimers     = map[string]*time.Timer{}
)

func closeTempClient(did string) {
	tempClientsMu.Lock()
	client := tempClients[did]
	timer := tempTimers[did]
	delete(tempClients, did)
	delete(tempTimers, did)
	tempClientsMu.Unlock()
	if timer != nil {
		timer.Stop()
	}
	if client != nil {
		_ = client.Close()
	}
}

func getOrDialClient(userID, region, host, did, model string) (*miss.Client, error) {
	if c := miss.GetActiveClient(did); c != nil {
		return c, nil
	}
	tempClientsMu.Lock()
	if c := tempClients[did]; c != nil {
		if t := tempTimers[did]; t != nil {
			t.Reset(15 * time.Second)
		}
		tempClientsMu.Unlock()
		return c, nil
	}
	tempClientsMu.Unlock()

	if host == "" || did == "" {
		return nil, fmt.Errorf("xiaomi: no active P2P session for did=%s and host not provided", did)
	}

	raw := fmt.Sprintf("xiaomi://%s:%s@%s?did=%s&model=%s", defaultUserID(userID), region, host, did, model)
	u, err := url.Parse(raw)
	if err != nil {
		return nil, err
	}
	missURL, err := getCameraURL(u)
	if err != nil {
		return nil, err
	}
	c, err := miss.NewClient(missURL)
	if err != nil {
		return nil, err
	}

	tempClientsMu.Lock()
	tempClients[did] = c
	tempTimers[did] = time.AfterFunc(15*time.Second, func() {
		tempClientsMu.Lock()
		client := tempClients[did]
		delete(tempClients, did)
		delete(tempTimers, did)
		tempClientsMu.Unlock()
		if client != nil {
			_ = client.Close()
		}
	})
	tempClientsMu.Unlock()

	return c, nil
}

func toInt64Val(v any) int64 {
	switch x := v.(type) {
	case float64:
		return int64(x)
	case int64:
		return x
	case int:
		return int64(x)
	case json.Number:
		n, _ := x.Int64()
		return n
	case string:
		n, _ := strconv.ParseInt(strings.TrimSpace(x), 10, 64)
		return n
	}
	return 0
}

func apiXiaomiStorage(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	did := strings.TrimSpace(q.Get("did"))
	model := strings.TrimSpace(q.Get("model"))
	host := strings.TrimSpace(q.Get("host"))
	userID := defaultUserID(strings.TrimSpace(q.Get("user")))
	region := defaultRegion(q.Get("region"))
	refresh := q.Get("refresh") == "1"
	wantCatalog := q.Get("catalog") == "1"
	chNum, _ := strconv.Atoi(q.Get("channel"))

	if did == "" {
		http.Error(w, "missing did", http.StatusBadRequest)
		return
	}

	if !refresh && !wantCatalog {
		storageCacheMu.Lock()
		entry, ok := storageCache[did]
		storageCacheMu.Unlock()
		if ok && time.Since(entry.fetchedAt) < 30*time.Second {
			api.ResponseJSON(w, entry.payload)
			return
		}
	}

	siid := 3
	if model == "xiaomi.camera.cw701" || model == "isa.camera.hlc7" {
		siid = 4
	}

	propsReq := fmt.Sprintf(
		`{"params":[{"did":"%s","siid":%d,"piid":1},{"did":"%s","siid":%d,"piid":2},{"did":"%s","siid":%d,"piid":3},{"did":"%s","siid":%d,"piid":4}]}`,
		did, siid, did, siid, did, siid, did, siid,
	)
	resBytes, err := cloudRequest(userID, region, "/miotspec/prop/get", propsReq)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}

	var parsed []struct {
		Did   string `json:"did"`
		Siid  int    `json:"siid"`
		Piid  int    `json:"piid"`
		Code  int    `json:"code"`
		Value any    `json:"value"`
	}
	_ = json.Unmarshal(resBytes, &parsed)

	var statusVal, totalRaw, freeRaw, usedRaw int64
	for _, item := range parsed {
		if item.Code != 0 {
			continue
		}
		if item.Siid == siid {
			switch item.Piid {
			case 1:
				statusVal = toInt64Val(item.Value)
			case 2:
				totalRaw = toInt64Val(item.Value)
			case 3:
				freeRaw = toInt64Val(item.Value)
			case 4:
				usedRaw = toInt64Val(item.Value)
			}
		}
	}

	// Normalize KB vs Bytes (CW701 and HLC7 report KB; MOD11 reports Bytes)
	totalBytes := totalRaw
	freeBytes := freeRaw
	usedBytes := usedRaw
	if totalRaw > 0 && totalRaw < 1_000_000_000 {
		totalBytes = totalRaw * 1024
		freeBytes = freeRaw * 1024
		usedBytes = usedRaw * 1024
	}
	if usedBytes <= 0 && totalBytes >= freeBytes {
		usedBytes = totalBytes - freeBytes
	}

	statusLabel := "normal"
	switch statusVal {
	case 0:
		statusLabel = "normal"
	case 1:
		statusLabel = "no_sd_card"
	case 2:
		statusLabel = "formatting"
	case 3:
		statusLabel = "abnormal"
	case 4:
		statusLabel = "ejected"
	default:
		statusLabel = fmt.Sprintf("status_%d", statusVal)
	}

	if chNum < 0 {
		chNum = 0
	}
	normCh := miss.NormalizeChannel(model, uint32(chNum))

	activeClient := miss.GetActiveClient(did)
	var catalogItems []miss.SDCatalogItem
	var catalogErrStr string

	if wantCatalog {
		if activeClient == nil && host != "" && model != "" {
			if dialed, dErr := getOrDialClient(userID, region, host, did, model); dErr == nil {
				activeClient = dialed
			} else {
				catalogErrStr = dErr.Error()
			}
		}
		if activeClient != nil {
			items, cErr := activeClient.QuerySDCatalog(uint32(chNum))
			if cErr != nil {
				catalogErrStr = cErr.Error()
			}
			catalogItems = items
		}
		if len(catalogItems) == 0 {
			catalogItems = miss.GetCachedSDCatalog(did, normCh)
		}
	} else {
		catalogItems = miss.GetCachedSDCatalog(did, normCh)
	}

	catalogTimestamps := make([]uint32, 0, len(catalogItems))
	for _, it := range catalogItems {
		catalogTimestamps = append(catalogTimestamps, it.StartTime)
	}

	out := map[string]any{
		"did":               did,
		"model":             model,
		"status":            statusVal,
		"statusLabel":       statusLabel,
		"totalBytes":        totalBytes,
		"freeBytes":         freeBytes,
		"usedBytes":         usedBytes,
		"hasActiveSession":  activeClient != nil,
		"catalogTimestamps": catalogTimestamps,
		"catalogItems":      catalogItems,
		"catalogError":      catalogErrStr,
		"updatedAt":         time.Now().UTC().Format(time.RFC3339),
	}

	storageCacheMu.Lock()
	storageCache[did] = storageCacheEntry{
		fetchedAt: time.Now(),
		payload:   out,
	}
	storageCacheMu.Unlock()

	api.ResponseJSON(w, out)
}

func apiXiaomiControl(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Did        string `json:"did"`
		Model      string `json:"model"`
		Host       string `json:"host"`
		User       string `json:"user"`
		Region     string `json:"region"`
		Type       string `json:"type"`
		Action     string `json:"action"`
		Channel    int    `json:"channel"`
		Speed      int    `json:"speed"`
		DurationMs int    `json:"durationMs"`
		Brightness int    `json:"brightness"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	userID := defaultUserID(req.User)
	region := defaultRegion(req.Region)

	switch strings.ToLower(req.Type) {
	case "ptz":
		action := strings.ToLower(strings.TrimSpace(req.Action))
		op := -1001
		switch action {
		case "left":
			op = 1
		case "right":
			op = 2
		case "up":
			op = 3
		case "down":
			op = 4
		case "home", "calibrate", "reset":
			op = 5
		case "stop", "off":
			op = -1001
		default:
			http.Error(w, "unsupported ptz action", http.StatusBadRequest)
			return
		}

		// For home/calibrate on cw701, if no P2P session is open, we can also trigger MIoT PTZ calibrate (siid=2, aiid=1)
		client, err := getOrDialClient(userID, region, req.Host, req.Did, req.Model)
		if err != nil {
			if op == 5 && req.Model == "xiaomi.camera.cw701" {
				miotAction := fmt.Sprintf(`{"params":{"did":"%s","siid":2,"aiid":1,"in":[]}}`, req.Did)
				res, mErr := cloudRequest(userID, region, "/miotspec/action", miotAction)
				if mErr == nil {
					api.ResponseJSON(w, map[string]any{"ok": true, "transport": "miot", "raw": json.RawMessage(res)})
					return
				}
			}
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}

		var cmdID uint32 = 0x112
		if req.Channel == 1 {
			cmdID = 0x118
		}
		payload := fmt.Sprintf(`{"operation":%d}`, op)
		if err := client.SendRawCommand(cmdID, payload); err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}

		// Auto-stop step nudge if durationMs >= 0 and op is directional (1..4)
		if op >= 1 && op <= 4 {
			dur := req.DurationMs
			if dur <= 0 {
				dur = 420
			}
			if dur > 0 && dur <= 5000 {
				time.AfterFunc(time.Duration(dur)*time.Millisecond, func() {
					_ = client.SendRawCommand(cmdID, `{"operation":-1001}`)
				})
			}
		}

		api.ResponseJSON(w, map[string]any{
			"ok":        true,
			"transport": "miss-p2p",
			"cmd":       cmdID,
			"operation": op,
		})

	case "light":
		on := strings.ToLower(req.Action) == "on" || strings.ToLower(req.Action) == "true" || req.Action == "1"
		var params string
		switch req.Model {
		case "xiaomi.camera.cw701":
			nightLightVal := 0
			if on {
				nightLightVal = 3
			}
			if req.Brightness > 0 {
				params = fmt.Sprintf(
					`{"params":[{"did":"%s","siid":21,"piid":1,"value":%t},{"did":"%s","siid":6,"piid":21,"value":%d},{"did":"%s","siid":21,"piid":2,"value":%d}]}`,
					req.Did, on, req.Did, nightLightVal, req.Did, req.Brightness,
				)
			} else {
				params = fmt.Sprintf(
					`{"params":[{"did":"%s","siid":21,"piid":1,"value":%t},{"did":"%s","siid":6,"piid":21,"value":%d}]}`,
					req.Did, on, req.Did, nightLightVal,
				)
			}
		case "mxiang.camera.mod11":
			swVal := 0
			if on {
				swVal = 1
			}
			if req.Brightness > 0 {
				params = fmt.Sprintf(
					`{"params":[{"did":"%s","siid":4,"piid":15,"value":%d},{"did":"%s","siid":4,"piid":3,"value":%d}]}`,
					req.Did, swVal, req.Did, req.Brightness,
				)
			} else {
				params = fmt.Sprintf(
					`{"params":[{"did":"%s","siid":4,"piid":15,"value":%d}]}`,
					req.Did, swVal,
				)
			}
		default:
			http.Error(w, "model does not support floodlight control", http.StatusBadRequest)
			return
		}

		res, err := cloudRequest(userID, region, "/miotspec/prop/set", params)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		api.ResponseJSON(w, map[string]any{"ok": true, "on": on, "raw": json.RawMessage(res)})

	case "siren":
		on := strings.ToLower(req.Action) == "on" || strings.ToLower(req.Action) == "trigger" || req.Action == "1"
		var res []byte
		var err error
		switch req.Model {
		case "xiaomi.camera.cw701":
			propParams := fmt.Sprintf(`{"params":[{"did":"%s","siid":2,"piid":13,"value":%t}]}`, req.Did, on)
			res, err = cloudRequest(userID, region, "/miotspec/prop/set", propParams)
			if on {
				actParams := fmt.Sprintf(`{"params":{"did":"%s","siid":24,"aiid":1,"in":[]}}`, req.Did)
				_, _ = cloudRequest(userID, region, "/miotspec/action", actParams)
			}
		case "mxiang.camera.mod11":
			aiid := 3
			if on {
				aiid = 1
			}
			actParams := fmt.Sprintf(`{"params":{"did":"%s","siid":4,"aiid":%d,"in":[]}}`, req.Did, aiid)
			res, err = cloudRequest(userID, region, "/miotspec/action", actParams)
		case "isa.camera.hlc7":
			if on {
				actParams := fmt.Sprintf(`{"params":{"did":"%s","siid":6,"aiid":3,"in":[]}}`, req.Did)
				res, err = cloudRequest(userID, region, "/miotspec/action", actParams)
			} else {
				res = []byte(`{"code":0}`)
			}
		default:
			http.Error(w, "unsupported model for siren", http.StatusBadRequest)
			return
		}
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		api.ResponseJSON(w, map[string]any{"ok": true, "on": on, "raw": json.RawMessage(res)})

	case "playback_speed":
		client := miss.GetActivePlaybackClient(req.Did)
		if client == nil {
			var err error
			client, err = getOrDialClient(userID, region, req.Host, req.Did, req.Model)
			if err != nil {
				http.Error(w, err.Error(), http.StatusBadGateway)
				return
			}
		}
		if err := client.SetPlaybackSpeed(req.Speed); err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		api.ResponseJSON(w, map[string]any{"ok": true, "speed": req.Speed, "status": client.LastPlaybackStatus()})

	default:
		http.Error(w, "unknown control type", http.StatusBadRequest)
	}
}

func apiXiaomiTalkback(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Did          string   `json:"did"`
		Model        string   `json:"model"`
		Host         string   `json:"host"`
		User         string   `json:"user"`
		Region       string   `json:"region"`
		Action       string   `json:"action"`
		Codec        string   `json:"codec"`
		FramesBase64 []string `json:"framesBase64"`
		RawBase64    string   `json:"rawBase64"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	userID := defaultUserID(req.User)
	client, err := getOrDialClient(userID, defaultRegion(req.Region), req.Host, req.Did, req.Model)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}

	switch strings.ToLower(req.Action) {
	case "start":
		if err := client.StartSpeaker(); err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		api.ResponseJSON(w, map[string]any{"ok": true, "action": "start", "speakerCodec": client.SpeakerCodec()})
		return

	case "stop":
		if err := client.StopSpeaker(); err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		api.ResponseJSON(w, map[string]any{"ok": true, "action": "stop"})
		return
	}

	// Default action: send audio frames
	if err := client.StartSpeaker(); err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}

	codecID := client.SpeakerCodec()
	switch strings.ToLower(req.Codec) {
	case "opus":
		codecID = 1032
	case "pcma":
		codecID = 1027
	case "pcm":
		codecID = 1024
	}

	framesSent := 0
	bytesSent := 0

	if len(req.FramesBase64) > 0 {
		var pendingOpus []byte
		for _, b64 := range req.FramesBase64 {
			pkt, err := base64.StdEncoding.DecodeString(b64)
			if err != nil || len(pkt) == 0 {
				continue
			}
			if codecID == 1032 {
				// Join two 20ms OPUS frames into one 40ms frame if frames are 20ms
				if pendingOpus == nil {
					pendingOpus = pkt
					continue
				}
				joined := opus.JoinFrames(pendingOpus, pkt)
				pendingOpus = nil
				if err := client.WriteAudio(codecID, joined); err != nil {
					http.Error(w, err.Error(), http.StatusBadGateway)
					return
				}
				framesSent++
				bytesSent += len(joined)
				time.Sleep(35 * time.Millisecond)
			} else {
				if err := client.WriteAudio(codecID, pkt); err != nil {
					http.Error(w, err.Error(), http.StatusBadGateway)
					return
				}
				framesSent++
				bytesSent += len(pkt)
				time.Sleep(35 * time.Millisecond)
			}
		}
		if pendingOpus != nil {
			_ = client.WriteAudio(codecID, pendingOpus)
			framesSent++
			bytesSent += len(pendingOpus)
		}
	} else if req.RawBase64 != "" {
		raw, err := base64.StdEncoding.DecodeString(req.RawBase64)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		frameSize := 320 // 8kHz PCMA 40ms
		if codecID == 1024 {
			frameSize = 640 // 8kHz 16-bit PCM 40ms
		}
		for off := 0; off+frameSize <= len(raw); off += frameSize {
			chunk := raw[off : off+frameSize]
			if err := client.WriteAudio(codecID, chunk); err != nil {
				http.Error(w, err.Error(), http.StatusBadGateway)
				return
			}
			framesSent++
			bytesSent += len(chunk)
			time.Sleep(35 * time.Millisecond)
		}
	}

	api.ResponseJSON(w, map[string]any{
		"ok":         true,
		"codecID":    codecID,
		"framesSent": framesSent,
		"bytesSent":  bytesSent,
	})
}
