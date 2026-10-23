// Targeted disassembly/decompilation, without modifying the installed runtime.
// @category SliceRefiner
import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.*;
import ghidra.program.model.address.*;
import ghidra.program.model.listing.*;
import java.io.*;

public class DumpFunctions extends GhidraScript {
    public void run() throws Exception {
        String[] args = getScriptArgs();
        DecompInterface decomp = new DecompInterface();
        decomp.openProgram(currentProgram);
        try (PrintWriter out = new PrintWriter(new FileWriter(args[0]))) {
            for (int i=1; i<args.length; i++) {
                Address start = toAddr(args[i]);
                disassemble(start);
                Function f = getFunctionAt(start);
                if (f == null) f = createFunction(start, null);
                out.println("// FUNCTION " + start);
                if (f != null) {
                    DecompileResults result = decomp.decompileFunction(f, 60, monitor);
                    out.println(result.decompileCompleted() ? result.getDecompiledFunction().getC() : result.getErrorMessage());
                }
            }
        }
        decomp.dispose();
    }
}
