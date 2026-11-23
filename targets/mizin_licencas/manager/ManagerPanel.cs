using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Linq;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace Mizin.Wire {
    internal sealed partial class Manager {
        static readonly Color Canvas=Color.FromArgb(23,27,29), Rail=Color.FromArgb(15,19,20);
        static readonly Color Surface=Color.FromArgb(39,46,48), Ink=Color.FromArgb(241,244,238);
        static readonly Color Muted=Color.FromArgb(189,201,194), Lime=Color.FromArgb(187,238,128);
        readonly Panel body=new Panel(), accountPage=new Panel(), collectionPage=new Panel();
        readonly Label heading=new Label(), subtitle=new Label(), selection=new Label(), empty=new Label();
        readonly ListBox storeList=new ListBox();
        readonly Button buy=new Button(), demo=new Button(), enterAccount=new Button();
        readonly Dictionary<string,Button> pages=new Dictionary<string,Button>();
        readonly Font large=new Font("Segoe UI",24,FontStyle.Bold), bold=new Font("Segoe UI",12,FontStyle.Bold);
        string page;
        static void StyleButton(Button b,string caption,bool accent=false) {
            b.Text=caption; b.AutoSize=true; b.Height=38; b.Padding=new Padding(9,3,9,3);
            b.FlatStyle=FlatStyle.Flat; b.FlatAppearance.BorderSize=0;
            b.BackColor=accent?Lime:Surface; b.ForeColor=accent?Rail:Ink; b.Cursor=Cursors.Hand;
            b.Margin=new Padding(0,2,8,3);
        }
        static Label Caption(string text) {return new Label { Text=text,AutoSize=true,ForeColor=Muted,Margin=new Padding(0,8,0,4) };}
        void BuildPanel() {
            Text="Mizin Studio · Plugins Wire"; Font=new Font("Segoe UI",10);
            ForeColor=Ink; BackColor=Canvas; AutoScaleMode=AutoScaleMode.Dpi;
            MinimumSize=new Size(860,590); ClientSize=new Size(1000,610); StartPosition=FormStartPosition.CenterScreen;
            var shell=new TableLayoutPanel { Dock=DockStyle.Fill,ColumnCount=2,RowCount=1,Margin=Padding.Empty };
            shell.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,190));shell.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
            shell.RowStyles.Add(new RowStyle(SizeType.Percent,100));Controls.Add(shell);
            var rail=new FlowLayoutPanel { Dock=DockStyle.Fill,BackColor=Rail,FlowDirection=FlowDirection.TopDown,WrapContents=false,Padding=new Padding(16,26,12,16),Margin=Padding.Empty };
            shell.Controls.Add(rail,0,0);
            rail.Controls.Add(new Label { Text="MIZIN",AutoSize=true,Font=large,ForeColor=Lime,Margin=new Padding(0,0,0,1) });
            rail.Controls.Add(new Label { Text="PLUGIN STUDIO",AutoSize=true,ForeColor=Muted,Margin=new Padding(2,0,0,32) });
            foreach(var item in new[]{new[]{"store","Explorar plugins"},new[]{"library","Minha biblioteca"},new[]{"account","Conta e conexão"}}) {
                var key=item[0];var b=new Button();StyleButton(b,item[1]);b.Width=157;b.AutoSize=false;b.Height=42;b.TextAlign=ContentAlignment.MiddleLeft;
                b.Click+=async delegate {ShowPage(key);if(key=="store") await Run(LoadStore);else if(key=="library" && !String.IsNullOrEmpty(profile.session)) await Run(Sync);};
                pages.Add(key,b);rail.Controls.Add(b);
            }
            var main=new TableLayoutPanel {Dock=DockStyle.Fill,Padding=new Padding(26,18,24,18),ColumnCount=1,RowCount=4,Margin=Padding.Empty};
            main.RowStyles.Add(new RowStyle(SizeType.Absolute,54));main.RowStyles.Add(new RowStyle(SizeType.Absolute,40));
            main.RowStyles.Add(new RowStyle(SizeType.Percent,100));main.RowStyles.Add(new RowStyle(SizeType.Absolute,48));
            main.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));shell.Controls.Add(main,1,0);
            heading.Font=large;heading.Dock=DockStyle.Fill;heading.TextAlign=ContentAlignment.MiddleLeft;main.Controls.Add(heading,0,0);
            subtitle.Dock=DockStyle.Fill;subtitle.ForeColor=Muted;main.Controls.Add(subtitle,0,1);
            body.Dock=DockStyle.Fill;main.Controls.Add(body,0,2);
            status.ForeColor=Lime;status.Dock=DockStyle.Fill;status.TextAlign=ContentAlignment.MiddleLeft;main.Controls.Add(status,0,3);
            collectionPage.Dock=accountPage.Dock=DockStyle.Fill;body.Controls.Add(collectionPage);body.Controls.Add(accountPage);
            var layout=new TableLayoutPanel { Dock=DockStyle.Fill,ColumnCount=1,RowCount=4,Margin=Padding.Empty };
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent,100));layout.RowStyles.Add(new RowStyle(SizeType.Absolute,48));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute,51));layout.RowStyles.Add(new RowStyle(SizeType.Absolute,50));
            collectionPage.Controls.Add(layout);
            var stage=new Panel {Dock=DockStyle.Fill,BackColor=Canvas};layout.Controls.Add(stage,0,0);
            foreach(var box in new[]{list,storeList}) {
                box.AccessibleName=box==list?"Plugins da biblioteca":"Catálogo de plugins";
                box.Dock=DockStyle.Fill;box.BackColor=Canvas;box.ForeColor=Ink;box.BorderStyle=BorderStyle.None;
                box.DrawMode=DrawMode.OwnerDrawFixed;box.ItemHeight=84;box.IntegralHeight=false;
                box.DrawItem+=DrawPlugin;box.SelectedIndexChanged+=delegate {UpdateActions();};stage.Controls.Add(box);
            }
            empty.Dock=DockStyle.Fill;empty.ForeColor=Muted;empty.TextAlign=ContentAlignment.MiddleCenter;stage.Controls.Add(empty);
            selection.Dock=DockStyle.Fill;selection.TextAlign=ContentAlignment.MiddleLeft;selection.ForeColor=Muted;layout.Controls.Add(selection,0,1);
            var actions=new FlowLayoutPanel { Dock=DockStyle.Fill,WrapContents=false };layout.Controls.Add(actions,0,2);
            StyleButton(buy,"Ver na loja",true);StyleButton(demo,"Baixar demo");StyleButton(activate,"Ativar nesta máquina",true);
            StyleButton(download,"Baixar plugin");StyleButton(refresh,"Sincronizar");StyleButton(enterAccount,"Entrar na conta",true);
            foreach(var b in new[]{buy,demo,activate,download,refresh,enterAccount}) actions.Controls.Add(b);
            buy.Click+=delegate {var p=storeList.SelectedItem as Plugin;if(p!=null)OpenShop("/?produto="+Uri.EscapeDataString(p.offer));};
            demo.Click+=delegate {var p=storeList.SelectedItem as Plugin;if(p!=null)OpenShop("/api/wire/demo?product="+Uri.EscapeDataString(p.product)+"&release="+Uri.EscapeDataString(p.release));};
            enterAccount.Click+=delegate {ShowPage("account"); email.Focus();};
            authorized.ForeColor=Muted;authorized.Dock=DockStyle.Fill;authorized.AutoEllipsis=true;layout.Controls.Add(authorized,0,3);
            var form=new FlowLayoutPanel { Dock=DockStyle.Fill,FlowDirection=FlowDirection.TopDown,WrapContents=false,AutoScroll=true };
            accountPage.Controls.Add(form);
            form.Controls.Add(Caption("E-mail da loja"));email.Width=330;email.Text=profile.email;form.Controls.Add(email);
            form.Controls.Add(Caption("Senha"));password.Width=330;password.UseSystemPasswordChar=true;form.Controls.Add(password);
            var auth=new FlowLayoutPanel { AutoSize=true,Margin=new Padding(0,12,0,18) };
            StyleButton(login,"Entrar",true);StyleButton(logout,"Sair da conta");auth.Controls.Add(login);auth.Controls.Add(logout);form.Controls.Add(auth);
            form.Controls.Add(Caption("Porta de entrada OSC do Wire ou Arena"));
            port.Minimum=1;port.Maximum=65535;port.Value=profile.port;port.Width=130;form.Controls.Add(port);
            port.ValueChanged+=delegate {profile.port=(int)port.Value;try {Local.Save(profile);}catch(Exception e){status.Text=e.Message;}};
            ShowCached();ShowPage(String.IsNullOrEmpty(profile.session)?"store":"library");
        }
        void OpenShop(string path) {
            try {Process.Start(new ProcessStartInfo(new Uri(Local.Origin,path).AbsoluteUri){UseShellExecute=true});}
            catch(Exception e) {status.Text=e.Message;}
        }
        void ShowCached() {
            list.Items.Clear();
            foreach(var entry in profile.entries) if(Local.Check(entry,profile.key)!=null) list.Items.Add(entry.plugin);
            if(list.Items.Count>0)list.SelectedIndex=0;
        }
        void ShowPage(string key) {
            page=key;bool store=key=="store",account=key=="account";
            foreach(var item in pages) {item.Value.BackColor=item.Key==key?Surface:Rail;item.Value.ForeColor=item.Key==key?Lime:Muted;}
            collectionPage.Visible=!account;accountPage.Visible=account;list.Visible=!store;storeList.Visible=store;
            authorized.Visible=key=="library";
            heading.Text=store?"Explorar plugins":account?"Conta e conexão":"Minha biblioteca";
            subtitle.Text=store?"Plugins Wire disponíveis na loja Mizin.":account?"Use a mesma conta da sua compra.":profile.email??"Entre para sincronizar suas compras.";
            AcceptButton=account?login:null;status.Text="";UpdateActions();
        }
        void UpdateActions() {
            if(page==null)return;
            bool store=page=="store",signed=!String.IsNullOrEmpty(profile.session);
            var box=store?storeList:list;
            var p=box.SelectedItem as Plugin;
            bool active=p!=null && !store && profile.entries.Any(e=>Same(e.plugin,p) && Local.Check(e,profile.key)!=null);
            buy.Visible=demo.Visible=store;refresh.Visible=!store&&signed;enterAccount.Visible=!store&&!signed;
            activate.Visible=download.Visible=!store&&signed;login.Enabled=!busy;logout.Enabled=!busy&&(signed||profile.entries.Count>0);
            buy.Enabled=!busy&&p!=null&&p.offer!=null;demo.Enabled=!busy&&p!=null&&p.hasDemo;refresh.Enabled=!busy;
            activate.Enabled=!busy&&p!=null&&!active;download.Enabled=!busy&&active;
            foreach(var b in pages.Values)b.Enabled=!busy;
            empty.Text=store?"Nenhum plugin carregado.":signed?"Sua conta ainda não possui plugins Wire.":"Suas compras aparecem aqui depois do login.";
            empty.Visible=box.Items.Count==0;if(empty.Visible)empty.BringToFront();else box.BringToFront();
            selection.Text=p==null?"":store?(p.hasDemo?"Demo com marca-d’água disponível.":"Selecione Ver na loja para consultar a oferta.") :
                (active?"Ativado nesta máquina":"Disponível para ativação")+"   ·   "+p.used+" de "+p.seats+" máquinas   ·   Licença "+p.licenseId.Substring(0,6);
        }
        async Task LoadStore() {
            var catalog=await Call<Library>("/api/wire/store");
            storeList.Items.Clear();storeList.Items.AddRange(catalog.plugins);
            if(storeList.Items.Count>0)storeList.SelectedIndex=0;
            UpdateActions();
        }
        void DrawPlugin(object sender,DrawItemEventArgs e) {
            var box=(ListBox)sender;
            if(e.Index<0 || e.Index>=box.Items.Count)return;
            var p=(Plugin)box.Items[e.Index];bool selected=(e.State&DrawItemState.Selected)!=0;
            var r=e.Bounds; r.Inflate(-2,-4);
            using(var background=new SolidBrush(Canvas)) e.Graphics.FillRectangle(background,e.Bounds);
            using(var bg=new SolidBrush(selected?Color.FromArgb(44,59,54):Surface)) e.Graphics.FillRectangle(bg,r);
            var tile=new Rectangle(r.X+8,r.Y+8,75,r.Height-16);
            bool cool=p.product=="slice-refine";
            using(var bg=new LinearGradientBrush(tile,cool?Color.FromArgb(18,75,87):Color.FromArgb(76,57,107),Rail,32f))e.Graphics.FillRectangle(bg,tile);
            var old=e.Graphics.Save();e.Graphics.SetClip(tile);
            using(var pen=new Pen(cool?Lime:Color.FromArgb(204,184,255),1.8f)) {
                for(int i=0;i<9;i++) {
                    float x=tile.Left+6+i*5,y=tile.Top+3+i*3;
                    if(cool)e.Graphics.DrawRectangle(pen,x,y,49,32);else e.Graphics.DrawEllipse(pen,x-21,y-9,57,37);
                }
            }
            e.Graphics.Restore(old);
            var title=new Rectangle(r.X+96,r.Y+10,Math.Max(0,r.Width-106),26);
            TextRenderer.DrawText(e.Graphics,p.name,bold,title,Ink,TextFormatFlags.EndEllipsis|TextFormatFlags.NoPrefix);
            title.Offset(0,29);TextRenderer.DrawText(e.Graphics,"Wire   ·   "+p.release,Font,title,Muted,TextFormatFlags.EndEllipsis|TextFormatFlags.NoPrefix);
            if(selected)using(var accent=new SolidBrush(Lime))e.Graphics.FillRectangle(accent,r.X,r.Y,3,r.Height);
            if((e.State&DrawItemState.Focus)!=0)e.DrawFocusRectangle();
        }
    }
}
