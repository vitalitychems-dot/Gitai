"""Run the two-node synthetic tests with kernel-enforced IP socket denial.
Linux + libseccomp prerequisite. This never changes the host network.
"""
import ctypes
import errno
import os
import socket
import platform

# Direct, small seccomp-BPF filter; no optional libseccomp installation.
machine = platform.machine()
arches = {
    "x86_64": (0xC000003E, [41, 42, 43, 49, 50, 288]),
    "aarch64": (0xC00000B7, [198, 200, 201, 202, 203, 242]),
}
if machine not in arches:
    raise RuntimeError("Unsupported test architecture; network-denied test not run")
arch, denied = arches[machine]
class Filter(ctypes.Structure):
    _fields_ = [("code", ctypes.c_ushort), ("jt", ctypes.c_ubyte),
                ("jf", ctypes.c_ubyte), ("k", ctypes.c_uint)]
class Program(ctypes.Structure):
    _fields_ = [("len", ctypes.c_ushort), ("filter", ctypes.POINTER(Filter))]
instructions = [
    Filter(0x20, 0, 0, 4),             # load seccomp_data.arch
    Filter(0x15, 1, 0, arch),          # correct arch skips kill
    Filter(0x06, 0, 0, 0x80000000),    # kill on unexpected ABI
    Filter(0x20, 0, 0, 0),             # load syscall nr
]
for number in denied:
    instructions.extend([Filter(0x15, 0, 1, number),
                         Filter(0x06, 0, 0, 0x00050000 | errno.EPERM)])
instructions.append(Filter(0x06, 0, 0, 0x7FFF0000))
filters = (Filter * len(instructions))(*instructions)
program = Program(len(instructions), filters)
libc = ctypes.CDLL(None, use_errno=True)
if libc.prctl(38, 1, 0, 0, 0) != 0 or libc.prctl(22, 2, ctypes.byref(program), 0, 0) != 0:
    raise RuntimeError("Kernel network denial unavailable; test not run")
try:
    socket.socket(socket.AF_INET, socket.SOCK_STREAM)
except PermissionError:
    print("Verified: kernel denies sockets; child Node/Git processes inherit denial.", flush=True)
else:
    raise RuntimeError("Network was NOT denied")
os.execvp("node", ["node", "--test", "tools/gitai-offline.test.mjs"])
