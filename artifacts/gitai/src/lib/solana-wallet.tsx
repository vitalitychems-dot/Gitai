import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type PublicKeyLike = { toString(): string };

type PhantomProvider = {
  isPhantom?: boolean;
  isConnected?: boolean;
  publicKey?: PublicKeyLike | null;
  connect: (options?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey?: PublicKeyLike }>;
  disconnect?: () => Promise<void>;
  on?: (event: "connect" | "disconnect", listener: (key?: PublicKeyLike) => void) => void;
  off?: (event: "connect" | "disconnect", listener: (key?: PublicKeyLike) => void) => void;
};

declare global {
  interface Window {
    phantom?: { solana?: PhantomProvider };
    solana?: PhantomProvider;
  }
}

type WalletContextValue = {
  available: boolean;
  address: string | null;
  connecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
};

const WalletContext = createContext<WalletContextValue | null>(null);

function getPhantomProvider(): PhantomProvider | null {
  if (typeof window === "undefined") return null;
  const provider = window.phantom?.solana ?? window.solana ?? null;
  return provider?.isPhantom ? provider : null;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [available, setAvailable] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    const provider = getPhantomProvider();
    setAvailable(Boolean(provider));
    if (!provider) return;

    if (provider.isConnected && provider.publicKey) {
      setAddress(provider.publicKey.toString());
    }

    const onConnect = (key?: PublicKeyLike) => {
      const nextAddress = key?.toString() ?? provider.publicKey?.toString() ?? null;
      setAddress(nextAddress);
    };
    const onDisconnect = () => setAddress(null);
    provider.on?.("connect", onConnect);
    provider.on?.("disconnect", onDisconnect);

    return () => {
      provider.off?.("connect", onConnect);
      provider.off?.("disconnect", onDisconnect);
    };
  }, []);

  const connect = useCallback(async () => {
    const provider = getPhantomProvider();
    if (!provider) {
      throw new Error("Install the Phantom browser wallet to connect.");
    }
    setConnecting(true);
    try {
      const result = await provider.connect();
      const nextAddress = result.publicKey?.toString() ?? provider.publicKey?.toString();
      if (!nextAddress) throw new Error("Phantom did not return a public wallet address.");
      setAvailable(true);
      setAddress(nextAddress);
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    const provider = getPhantomProvider();
    await provider?.disconnect?.();
    setAddress(null);
  }, []);

  const value = useMemo(
    () => ({ available, address, connecting, connect, disconnect }),
    [available, address, connecting, connect, disconnect],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useSolanaWallet(): WalletContextValue {
  const value = useContext(WalletContext);
  if (!value) throw new Error("useSolanaWallet must be used inside WalletProvider.");
  return value;
}
