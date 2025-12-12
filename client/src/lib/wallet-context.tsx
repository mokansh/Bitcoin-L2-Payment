import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { Wallet, Transaction, Merchant } from "@shared/schema";

declare global {
  interface Window {
    unisat?: {
      requestAccounts: () => Promise<string[]>;
      getAccounts: () => Promise<string[]>;
      getPublicKey: () => Promise<string>;
      sendBitcoin: (to: string, amount: number) => Promise<string>;
      signPsbt: (psbtData: string) => Promise<string>;
    };
  }
}

interface WalletContextType {
  bitcoinAddress: string | null;
  publicKey: string | null;
  isConnecting: boolean;
  error: string | null;
  wallet: Wallet | null;
  transactions: Transaction[];
  merchants: Merchant[];
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
  setWallet: (wallet: Wallet | null) => void;
  setTransactions: (transactions: Transaction[]) => void;
  addTransaction: (transaction: Transaction) => void;
  updateTransaction: (txid: string, updates: Partial<Transaction>) => void;
  setMerchants: (merchants: Merchant[]) => void;
  addMerchant: (merchant: Merchant) => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [bitcoinAddress, setBitcoinAddress] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [merchants, setMerchants] = useState<Merchant[]>([]);

  const connectWallet = useCallback(async () => {
    setIsConnecting(true);
    setError(null);

    try {
      if (!window.unisat) {
        throw new Error("Unisat wallet not found. Please install the Unisat browser extension.");
      }

      const accounts = await window.unisat.requestAccounts();
      if (accounts.length === 0) {
        throw new Error("No accounts found. Please unlock your wallet.");
      }

      const pubKey = await window.unisat.getPublicKey();
      setBitcoinAddress(accounts[0]);
      setPublicKey(pubKey);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to connect wallet";
      setError(message);
      
      // For demo purposes, simulate connection if Unisat is not available
      if (!window.unisat) {
        const mockAddress = "bc1p" + Array.from({ length: 58 }, () => 
          "0123456789abcdefghjkmnpqrstuvwxyz"[Math.floor(Math.random() * 32)]
        ).join("");
        const mockPubKey = Array.from({ length: 64 }, () => 
          "0123456789abcdef"[Math.floor(Math.random() * 16)]
        ).join("");
        setBitcoinAddress(mockAddress);
        setPublicKey(mockPubKey);
        setError(null);
      }
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnectWallet = useCallback(() => {
    setBitcoinAddress(null);
    setPublicKey(null);
    setWallet(null);
    setTransactions([]);
    setMerchants([]);
    setError(null);
  }, []);

  const addTransaction = useCallback((transaction: Transaction) => {
    setTransactions(prev => [...prev, transaction]);
  }, []);

  const updateTransaction = useCallback((txid: string, updates: Partial<Transaction>) => {
    setTransactions(prev => 
      prev.map(tx => tx.txid === txid ? { ...tx, ...updates } : tx)
    );
  }, []);

  const addMerchant = useCallback((merchant: Merchant) => {
    setMerchants(prev => [...prev, merchant]);
  }, []);

  return (
    <WalletContext.Provider
      value={{
        bitcoinAddress,
        publicKey,
        isConnecting,
        error,
        wallet,
        transactions,
        merchants,
        connectWallet,
        disconnectWallet,
        setWallet,
        setTransactions,
        addTransaction,
        updateTransaction,
        setMerchants,
        addMerchant,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
}
