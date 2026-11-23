using System;
using System.Collections.Generic;
using System.Reflection;
using System.Web.Script.Serialization;

// Console-only test against the exact assembly shipped in the client ZIP.
public static class NativeGrantCheck {
    public static int Main(string[] args) {
        try {
            if (args.Length != 1) throw new ArgumentException("Informe o executável do gerenciador.");
            var json = new JavaScriptSerializer();
            var fields = json.Deserialize<Dictionary<string,string>>(Console.In.ReadToEnd());
            var assembly = Assembly.LoadFrom(args[0]);
            var entryType = assembly.GetType("Mizin.Wire.Entry", true);
            var verify = assembly.GetType("Mizin.Wire.Local", true).GetMethod("Check", BindingFlags.NonPublic | BindingFlags.Static);
            var plugin = new { product=fields["product"], release=fields["release"], licenseId=fields["licenseId"] };
            Func<string,object> entry = signature => json.Deserialize(json.Serialize(new {
                plugin, proof = new { payload=fields["payload"], signature }
            }), entryType);
            var signed = entry(fields["signature"]);
            if (verify.Invoke(null,new object[]{signed,fields["installationKey"]}) == null) return 1;
            var other = fields["installationKey"][0]=='1' ? new string('2',64) : new string('1',64);
            if (verify.Invoke(null,new object[]{signed,other}) != null) return 2;
            var altered = Convert.FromBase64String(fields["signature"]);
            altered[0] ^= 1;
            return verify.Invoke(null,new object[]{entry(Convert.ToBase64String(altered)),fields["installationKey"]}) == null ? 0 : 3;
        } catch(Exception e) {
            Console.Error.WriteLine("Falha no verificador de homologação (" + e.GetBaseException().GetType().Name + ").");
            return 4;
        }
    }
}
