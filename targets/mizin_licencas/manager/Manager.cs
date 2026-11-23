using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace Mizin.Wire {
    public sealed class Plugin {
        public string name, product, release, licenseId, offer;
        public bool hasDemo;
        public int used, seats;
        public override string ToString() { return name + " · " + release; }
    }
    public sealed class Library { public Plugin[] plugins; }
    public sealed class Proof { public string payload, signature; }
    public sealed class Claims {
        public int v;
        public string scope, product, release, device, licenseId, channel;
        public long issued, expires;
    }
    public sealed class Entry { public Plugin plugin; public Proof proof; }
    public sealed class Profile {
        public string key, email, session;
        public int port = 7000;
        public List<Entry> entries = new List<Entry>();
    }
    public sealed class ApiError : Exception {
        public int Status;
        public ApiError(int status, string message) : base(message) { Status=status; }
    }
    internal static class Local {
        internal static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
        internal static readonly Uri Origin = new Uri(BuildConfig.Origin);
        internal static readonly string DirectoryName = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Mizin","Wire", Hash(BuildConfig.Origin+"|"+BuildConfig.PublicKey).Substring(0,24));
        static string PathName { get { return Path.Combine(DirectoryName,"profile.bin"); } }
        internal static string Hex(byte[] b) { return BitConverter.ToString(b).Replace("-","").ToLowerInvariant(); }
        internal static string Hash(string s) { using(var h=SHA256.Create()) return Hex(h.ComputeHash(Encoding.UTF8.GetBytes(s))); }
        internal static Profile Load() {
            if(File.Exists(PathName)) return Json.Deserialize<Profile>(Encoding.UTF8.GetString(ProtectedData.Unprotect(File.ReadAllBytes(PathName),null,DataProtectionScope.CurrentUser)));
            var b=new byte[32]; using(var random=RandomNumberGenerator.Create()) random.GetBytes(b);
            return new Profile { key=Hex(b) };
        }
        internal static void Save(Profile p) {
            Directory.CreateDirectory(DirectoryName);
            var bytes=ProtectedData.Protect(Encoding.UTF8.GetBytes(Json.Serialize(p)),null,DataProtectionScope.CurrentUser);
            var temp=PathName+".tmp";
            File.WriteAllBytes(temp,bytes);
            if(File.Exists(PathName)) File.Replace(temp,PathName,null); else File.Move(temp,PathName);
        }
        internal static Claims Check(Entry e,string installationKey) {
            if(e == null || e.plugin == null || e.proof == null) return null;
            try {
                using(var k=CngKey.Import(Convert.FromBase64String(BuildConfig.PublicKey),CngKeyBlobFormat.EccPublicBlob))
                using(var ec=new ECDsaCng(k)) {
                    ec.HashAlgorithm=CngAlgorithm.Sha256;
                    if(!ec.VerifyData(Encoding.ASCII.GetBytes(e.proof.payload),Convert.FromBase64String(e.proof.signature))) return null;
                }
                var c=Json.Deserialize<Claims>(Encoding.UTF8.GetString(Convert.FromBase64String(e.proof.payload)));
                long now=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                if(c.v!=1 || c.scope!="mizin-wire" || c.product!=e.plugin.product || c.release!=e.plugin.release ||
                   c.licenseId!=e.plugin.licenseId || c.device!=Hash(installationKey) || c.issued>now || c.expires<=now) return null;
                return c;
            } catch(FormatException) {return null;} catch(CryptographicException) {return null;}
        }
        internal static byte[] Osc(Plugin p, string channel) {
            byte[] address=Encoding.ASCII.GetBytes("/mizin/wire/"+p.product+"/"+p.release+(String.IsNullOrEmpty(channel)?"":"/"+channel));
            int pad=(address.Length+4)&~3;
            var bytes=new byte[pad+8]; Array.Copy(address,bytes,address.Length);
            bytes[pad]=44; bytes[pad+1]=102; bytes[pad+4]=63; bytes[pad+5]=128;
            return bytes;
        }
    }

    internal sealed partial class Manager : Form {
        readonly Profile profile;
        CookieContainer cookies=new CookieContainer();
        readonly HttpClient http;
        readonly TextBox email=new TextBox(), password=new TextBox();
        readonly ListBox list=new ListBox();
        readonly Label status=new Label(), authorized=new Label();
        readonly Button login=new Button(), logout=new Button(), activate=new Button(), refresh=new Button();
        readonly Button download=new Button();
        readonly NumericUpDown port=new NumericUpDown();
        readonly UdpClient udp=new UdpClient();
        readonly System.Windows.Forms.Timer timer=new System.Windows.Forms.Timer { Interval=1000 };
        DateTime nextCheck=DateTime.UtcNow;
        bool busy;
        internal Manager() {
            profile=Local.Load();
            if(!String.IsNullOrEmpty(profile.session)) cookies.Add(Local.Origin,new Cookie("session",profile.session,"/"));
            http=new HttpClient(new HttpClientHandler {CookieContainer=cookies,AllowAutoRedirect=false}) {BaseAddress=Local.Origin,Timeout=TimeSpan.FromSeconds(8)};
            BuildPanel();
            login.Click+=async delegate {await Run(Login);};
            logout.Click+=async delegate {await Run(SignOut);};
            refresh.Click+=async delegate {await Run(Sync);};
            activate.Click+=async delegate {await Run(ActivatePlugin);};
            download.Click+=async delegate {await Run(Download);};
            timer.Tick+=async delegate {
                var active=new List<string>();
                foreach(var entry in profile.entries) {
                    var c=Local.Check(entry,profile.key); if(c==null) continue;
                    var packet=Local.Osc(entry.plugin,c.channel);
                    try {udp.Send(packet,packet.Length,new IPEndPoint(IPAddress.Loopback,profile.port));}
                    catch(SocketException){status.Text="Porta OSC indisponível.";}
                    active.Add(entry.plugin.name+" até "+DateTimeOffset.FromUnixTimeMilliseconds(c.expires).LocalDateTime.ToString("g"));
                }
                authorized.Text=active.Count==0?"Nenhuma autorização offline válida.":"Ativos: "+String.Join(", ",active);
                if(!busy && !String.IsNullOrEmpty(profile.session) && DateTime.UtcNow>=nextCheck) await Run(Sync);
            };
            Shown+=async delegate {timer.Start(); if (String.IsNullOrEmpty(profile.session)) await Run(LoadStore);};
            FormClosed+=delegate {timer.Stop();http.Dispose();udp.Dispose();};
        }
        async Task Run(Func<Task> task) {
            if(busy) return;
            busy=true; UpdateActions();
            try {await task();}
            catch(ApiError e) {
                if(e.Status==401) {profile.session=null;ShowCached();Local.Save(profile);}
                status.Text=e.Message;
            } catch(HttpRequestException) {status.Text="Loja indisponível. Consulte a validade offline acima.";}
            catch(TaskCanceledException) {status.Text="A loja não respondeu a tempo.";}
            catch(Exception e) {status.Text=e.Message;}
            finally {busy=false;UpdateActions();}
        }
        async Task<T> Call<T>(string path,object data=null) {
            using(var req=new HttpRequestMessage(data==null?HttpMethod.Get:HttpMethod.Post,path)) {
                if(data!=null) req.Content=new StringContent(Local.Json.Serialize(data),Encoding.UTF8,"application/json");
                using(var res=await http.SendAsync(req)) {
                    var body=await res.Content.ReadAsStringAsync();
                    if(!res.IsSuccessStatusCode) {
                        var problem=Local.Json.Deserialize<Dictionary<string,object>>(body);
                        throw new ApiError((int)res.StatusCode,problem.ContainsKey("error")?(string)problem["error"]:"Falha na loja.");
                    }
                    return Local.Json.Deserialize<T>(body);
                }
            }
        }
        async Task Login() {
            var loginEmail=email.Text.Trim().ToLowerInvariant();
            try {await Call<object>("/api/login",new {email=loginEmail,password=password.Text});}
            finally {password.Clear();}
            if(!String.Equals(profile.email,loginEmail,StringComparison.OrdinalIgnoreCase)) profile.entries.Clear();
            profile.email=loginEmail;
            profile.session=cookies.GetCookies(Local.Origin)["session"].Value;
            Local.Save(profile);
            ShowPage("library");
            await Sync();
        }
        async Task SignOut() {
            // Stop heartbeats immediately, including when the network is down.
            profile.entries.Clear();profile.email=null;profile.session=null;ShowCached();Local.Save(profile);
            try {await Call<object>("/api/logout",new {});}
            finally {
                var c=cookies.GetCookies(Local.Origin)["session"];if(c!=null)c.Expired=true;
                email.Clear();password.Clear();ShowPage("account");status.Text="Sessão local encerrada.";
            }
        }
        async Task<Entry> Grant(Plugin plugin,bool newSeat) {
            var request=new {plugin.product,plugin.release,plugin.licenseId,installationKey=profile.key,label=Environment.MachineName};
            var proof=await Call<Proof>("/api/wire/"+(newSeat?"activate":"verify"),request);
            var entry=new Entry {plugin=plugin,proof=proof};
            if(Local.Check(entry,profile.key)==null) throw new InvalidDataException("Assinatura da autorização inválida para esta instalação.");
            return entry;
        }
        static bool Same(Plugin a,Plugin b) {return a.licenseId==b.licenseId && a.product==b.product && a.release==b.release;}
        async Task Download() {
            var p=list.SelectedItem as Plugin;
            if(p==null) throw new InvalidOperationException("Selecione um plugin comprado.");
            if(!profile.entries.Any(e=>Same(e.plugin,p) && Local.Check(e,profile.key)!=null))
                throw new InvalidOperationException("Ative o plugin nesta máquina antes de baixar.");
            using(var picker=new SaveFileDialog { Filter="Patch Wire (*.cwired)|*.cwired",FileName=p.product+"--"+p.release+".cwired" }) {
                if(picker.ShowDialog(this)!=DialogResult.OK) return;
                var request=new {p.licenseId,p.product,p.release,installationKey=profile.key};
                using(var msg=new HttpRequestMessage(HttpMethod.Post,"/api/wire/download")) {
                    msg.Content=new StringContent(Local.Json.Serialize(request),Encoding.UTF8,"application/json");
                    using(var res=await http.SendAsync(msg,HttpCompletionOption.ResponseHeadersRead)) {
                        if(!res.IsSuccessStatusCode) {
                            var e=Local.Json.Deserialize<Dictionary<string,object>>(await res.Content.ReadAsStringAsync());
                            throw new ApiError((int)res.StatusCode,(string)e["error"]);
                        }
                        var temp=picker.FileName+"."+Guid.NewGuid().ToString("N")+".tmp";
                        try {
                            using(var output=new FileStream(temp,FileMode.CreateNew,FileAccess.Write))
                                await res.Content.CopyToAsync(output);
                            if(File.Exists(picker.FileName)) File.Replace(temp,picker.FileName,null); else File.Move(temp,picker.FileName);
                        } finally {if(File.Exists(temp)) File.Delete(temp);}
                    }
                }
            }
            status.Text="Patch salvo. Abra o arquivo .cwired no Resolume para instalar.";
        }
        async Task Sync() {
            nextCheck=DateTime.UtcNow.AddMinutes(5);
            var library=await Call<Library>("/api/wire/library");
            list.Items.Clear();list.Items.AddRange(library.plugins);
            if(list.Items.Count>0)list.SelectedIndex=0;
            foreach(var old in profile.entries.ToArray()) {
                if(!library.plugins.Any(p=>Same(p,old.plugin))) {profile.entries.Remove(old);Local.Save(profile);continue;}
                try {var replacement=await Grant(old.plugin,false);profile.entries[profile.entries.IndexOf(old)]=replacement;}
                catch(ApiError e) {if(e.Status!=403 && e.Status!=404)throw;profile.entries.Remove(old);}
                Local.Save(profile);
            }
            list.Invalidate(); UpdateActions();
            nextCheck=DateTime.UtcNow.AddHours(1);
            status.Text=library.plugins.Length==0?"Nenhuma compra Wire disponível nesta conta.":"Compras sincronizadas.";
        }
        async Task ActivatePlugin() {
            var plugin=list.SelectedItem as Plugin;
            if(plugin==null) throw new InvalidOperationException("Entre e selecione um plugin comprado.");
            var entry=await Grant(plugin,true);
            profile.entries.RemoveAll(e=>Same(e.plugin,plugin));profile.entries.Add(entry);Local.Save(profile);
            list.Invalidate(); status.Text="Máquina ativada. O plugin está disponível para download.";
        }
    }
    internal static class Program {
        [STAThread] static void Main() {
            using(var mutex=new Mutex(false,"Local\\MizinWire-"+Local.Hash(BuildConfig.Origin).Substring(0,16))) {
                try {if(!mutex.WaitOne(0)) {MessageBox.Show("O gerenciador já está aberto.");return;}} catch(AbandonedMutexException) {}
                Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
                try {Application.Run(new Manager());} catch(Exception e) {MessageBox.Show(e.Message,"Mizin Wire");}
            }
        }
    }
}
