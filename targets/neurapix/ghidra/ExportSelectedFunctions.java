// Explicit native addresses selected from retained xrefs; no target execution.
// @category NeurapixAnalysis
import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.*;
import ghidra.program.model.listing.Function;
import com.google.gson.*;
import java.nio.file.*;

public class ExportSelectedFunctions extends GhidraScript {
    public void run() throws Exception {
        String[] args=getScriptArgs();Path output=Path.of(args[0]);Files.createDirectories(output);
        JsonArray rows=new JsonArray();DecompInterface decompiler=new DecompInterface();decompiler.openProgram(currentProgram);
        for (int i=1;i<args.length;i++) {
            Function f=currentProgram.getFunctionManager().getFunctionAt(toAddr(args[i]));
            JsonObject row=new JsonObject();row.addProperty("address",args[i]);
            if(f!=null) {
                DecompileResults r=decompiler.decompileFunction(f,60,monitor);
                row.addProperty("completed",r.decompileCompleted());row.addProperty("error",r.getErrorMessage());
                row.addProperty("bodyBytes",f.getBody().getNumAddresses());
                if(r.decompileCompleted()) Files.writeString(output.resolve(args[i]+".c"),r.getDecompiledFunction().getC());
            }
            rows.add(row);
        }
        decompiler.dispose();Files.writeString(output.resolve("selected-functions.json"),new GsonBuilder().setPrettyPrinting().create().toJson(rows));
    }
}
