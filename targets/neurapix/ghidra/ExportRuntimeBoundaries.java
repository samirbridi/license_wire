// Static native boundary evidence only. Output must remain private.
// @category NeurapixAnalysis
import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.program.model.listing.*;
import ghidra.program.model.symbol.*;
import ghidra.program.model.address.Address;
import com.google.gson.*;
import java.nio.file.*;
import java.util.*;
import java.util.regex.Pattern;

public class ExportRuntimeBoundaries extends GhidraScript {
    public void run() throws Exception {
        Path output = Path.of(getScriptArgs()[0]);
        Files.createDirectories(output);
        JsonObject root = new JsonObject();
        root.addProperty("schema", "neurapix.native-boundaries/1");
        root.addProperty("executableSha256", currentProgram.getExecutableSHA256());
        root.addProperty("language", currentProgram.getLanguageID().toString());
        root.addProperty("functionCount", currentProgram.getFunctionManager().getFunctionCount());
        root.addProperty("vendorExecution", false);
        JsonArray strings = new JsonArray();
        Pattern wanted = Pattern.compile("(?i).*(infer|predict|model|network|batch|cuda|smart_crop|exposure|socket|onnx|torch|initialize|decrypt).*", Pattern.DOTALL);
        Set<Address> selected = new LinkedHashSet<>();
        DataIterator iterator = currentProgram.getListing().getDefinedData(true);
        while (iterator.hasNext() && !monitor.isCancelled()) {
            Data data = iterator.next();
            if (!data.hasStringValue()) continue;
            String value = String.valueOf(data.getValue());
            if (value.length()>512 || !wanted.matcher(value).matches()) continue;
            JsonObject row = new JsonObject();
            row.addProperty("address", data.getAddress().toString());
            row.addProperty("value", value);
            JsonArray refs = new JsonArray();
            ReferenceIterator rit = currentProgram.getReferenceManager().getReferencesTo(data.getAddress());
            int count = 0;
            while (rit.hasNext() && count++ < 40) {
                Address from = rit.next().getFromAddress();
                JsonObject ref = new JsonObject();ref.addProperty("from", from.toString());
                Function function = currentProgram.getFunctionManager().getFunctionContaining(from);
                if (function != null) {
                    ref.addProperty("function", function.getEntryPoint().toString());
                    selected.add(function.getEntryPoint());
                }
                refs.add(ref);
            }
            row.add("references", refs);strings.add(row);
        }
        root.add("selectedStrings", strings);
        JsonArray functions = new JsonArray();
        DecompInterface decompiler = new DecompInterface();
        decompiler.openProgram(currentProgram);
        int count=0;
        for (Address address: selected) {
            if (count++>=12 || monitor.isCancelled()) break;
            Function function=currentProgram.getFunctionManager().getFunctionAt(address);
            if (function==null || function.getBody().getNumAddresses()>60000) continue;
            DecompileResults result=decompiler.decompileFunction(function, 25, monitor);
            JsonObject row=new JsonObject();row.addProperty("address", address.toString());
            row.addProperty("name", function.getName());row.addProperty("completed", result.decompileCompleted());
            if (result.decompileCompleted()) {
                String file=address.toString()+".c";
                Files.writeString(output.resolve(file), result.getDecompiledFunction().getC());
                row.addProperty("privatePseudocode",file);
            }
            functions.add(row);
        }
        decompiler.dispose();root.add("selectedFunctions",functions);
        Files.writeString(output.resolve("boundaries.json"),new GsonBuilder().setPrettyPrinting().create().toJson(root));
        println("Boundary evidence written. Functions="+root.get("functionCount")+", selectedStrings="+strings.size());
    }
}
