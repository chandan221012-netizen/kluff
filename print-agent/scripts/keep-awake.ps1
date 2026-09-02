Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Pwr {
    [DllImport("kernel32.dll")]
    public static extern uint SetThreadExecutionState(uint f);
}
"@ -ErrorAction SilentlyContinue

[Pwr]::SetThreadExecutionState([uint32]2147483649) | Out-Null
