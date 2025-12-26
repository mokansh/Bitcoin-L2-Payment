import { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useWallet } from "@/lib/wallet-context";
import { generateTaprootAddress, sendBitcoinTransaction, getBitcoinTxStatus, formatAddress, formatBTC, signPsbtWithWallet } from "@/lib/bitcoin";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useFundingAuth } from "@/hooks/use-funding-auth";
import type { Wallet, Merchant, Transaction } from "@shared/schema";
import {
  Wallet as WalletIcon,
  Bitcoin,
  Loader2,
  Copy,
  Check,
  AlertCircle,
  Store,
  ArrowRight,
  Zap,
  ExternalLink,
  Moon,
  Sun,
  RefreshCw
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Encode string data to hex without Buffer (works in browser)
const toHex = (value: string) =>
  Array.from(new TextEncoder().encode(value))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

type Section = 'home' | 'fund' | 'merchant' | 'settle';

function Header({ activeSection, onNavigate }: { activeSection: Section; onNavigate: (section: Section) => void }) {
  const { bitcoinAddress, isConnecting, connectWallet, disconnectWallet } = useWallet();
  const [copied, setCopied] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const { toast } = useToast();

  // Initialize theme from localStorage or system preference
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.classList.toggle('dark', savedTheme === 'dark');
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setTheme(prefersDark ? 'dark' : 'light');
      document.documentElement.classList.toggle('dark', prefersDark);
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  };

  const handleCopy = async () => {
    if (bitcoinAddress) {
      await navigator.clipboard.writeText(bitcoinAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <header className="fixed top-0 left-0 right-0 h-20 bg-gradient-to-br from-background via-background to-orange-500/5 backdrop-blur-md border-b border-gray-800/50 z-50 shadow-lg">
      <div className="w-full h-full px-6 md:px-16 lg:px-24 flex items-center justify-between gap-2 md:gap-4">
        {/* Logo - Extreme Left */}
        <button 
          onClick={() => onNavigate('home')}
          className="flex items-center gap-2 px-3 md:px-6 group cursor-pointer hover:opacity-90 transition-opacity"
        >
          <div className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/20 group-hover:shadow-orange-500/40 transition-all duration-300">
            <Bitcoin className="w-4 h-4 md:w-5 md:h-5 text-white group-hover:rotate-12 transition-transform duration-300" />
          </div>
          <span className="text-xl md:text-2xl lg:text-3xl font-bold text-white bg-gradient-to-r from-white to-gray-300 bg-clip-text">ByteStream</span>
        </button>
        
        {/* Navigation - Center */}
        <nav className="hidden md:flex absolute left-1/2 transform -translate-x-1/2 items-center gap-2">
          <Button
            variant={activeSection === 'fund' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => bitcoinAddress && onNavigate('fund')}
            disabled={!bitcoinAddress}
            className={`text-base ${activeSection === 'fund' ? 'bg-orange-500 hover:bg-orange-600' : 'text-gray-300 hover:text-white hover:bg-gray-800'} ${!bitcoinAddress ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <Zap className="w-4 h-4 mr-1.5" />
            Fund Wallet
          </Button>
          <Button
            variant={activeSection === 'merchant' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => bitcoinAddress && onNavigate('merchant')}
            disabled={!bitcoinAddress}
            className={`text-base ${activeSection === 'merchant' ? 'bg-orange-500 hover:bg-orange-600' : 'text-gray-300 hover:text-white hover:bg-gray-800'} ${!bitcoinAddress ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <Store className="w-4 h-4 mr-1.5" />
            Make Payment
          </Button>
          <Button
            variant={activeSection === 'settle' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => bitcoinAddress && onNavigate('settle')}
            disabled={!bitcoinAddress}
            className={`text-base ${activeSection === 'settle' ? 'bg-orange-500 hover:bg-orange-600' : 'text-gray-300 hover:text-white hover:bg-gray-800'} ${!bitcoinAddress ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <Bitcoin className="w-4 h-4 mr-1.5" />
            Settle to L1
          </Button>
        </nav>

        {/* Buttons - Extreme Right */}
        <div className="flex items-center gap-2 md:gap-3 px-3 md:px-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="text-gray-400 hover:text-white hover:bg-gray-800 h-8 w-8 md:h-10 md:w-10"
            data-testid="button-theme-toggle"
          >
            {theme === 'light' ? (
              <Moon className="w-4 h-4 md:w-5 md:h-5" />
            ) : (
              <Sun className="w-4 h-4 md:w-5 md:h-5" />
            )}
          </Button>
          
          {bitcoinAddress ? (
            <>
              <button
                onClick={handleCopy}
                className="hidden sm:flex items-center gap-2 px-2 md:px-3 py-1.5 md:py-2 rounded-lg bg-gray-800/50 hover:bg-gray-700 transition-all duration-200 text-gray-300 border border-gray-700/50 hover:border-orange-500/50 backdrop-blur-sm group"
                data-testid="button-copy-address"
              >
                <WalletIcon className="w-3.5 h-3.5 md:w-4 md:h-4 group-hover:text-orange-500 transition-colors" />
                <span className="font-mono text-xs md:text-sm">{formatAddress(bitcoinAddress)}</span>
                {copied ? (
                  <Check className="w-3.5 h-3.5 md:w-4 md:h-4 text-green-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5 md:w-4 md:h-4 group-hover:text-orange-500 transition-colors" />
                )}
              </button>
              <Button
                variant="outline"
                size="sm"
                onClick={disconnectWallet}
                className="border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white hover:border-red-500/50 text-xs md:text-sm h-8 md:h-9 transition-all duration-200"
                data-testid="button-disconnect"
              >
                Disconnect
              </Button>
            </>
          ) : (
            <Button
              onClick={connectWallet}
              disabled={isConnecting}
              className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white text-xs md:text-sm h-8 md:h-9 px-2 md:px-4 shadow-lg shadow-orange-500/30 hover:shadow-orange-500/50 hover:scale-105 transition-all duration-300"
              data-testid="button-connect-wallet"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 md:w-4 md:h-4 mr-1.5 md:mr-2 animate-spin" />
                  <span className="hidden sm:inline">Connecting...</span>
                  <span className="sm:hidden">...</span>
                </>
              ) : (
                <>
                  <WalletIcon className="w-3.5 h-3.5 md:w-4 md:h-4 mr-1.5 md:mr-2" />
                  <span className="hidden sm:inline">Connect Bitcoin Wallet</span>
                  <span className="sm:hidden">Connect</span>
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

function StepIndicator({ step, label, active, completed }: { step: number; label: string; active: boolean; completed: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${completed
          ? "bg-primary text-primary-foreground"
          : active
            ? "bg-primary/20 text-primary border-2 border-primary"
            : "bg-muted text-muted-foreground"
          }`}
      >
        {completed ? <Check className="w-4 h-4" /> : step}
      </div>
      <span className={`text-sm font-medium ${active || completed ? "text-foreground" : "text-muted-foreground"}`}>
        {label}
      </span>
    </div>
  );
}

function GenerateWalletSection() {
  const { bitcoinAddress, publicKey, wallet, setWallet } = useWallet();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  // Check if wallet exists when user connects, and auto-create if not
  useEffect(() => {
    async function checkOrCreateWallet() {
      if (bitcoinAddress && !wallet && publicKey && !isChecking) {
        setIsChecking(true);
        try {
          // First, check if wallet already exists
          const response = await fetch(`/api/wallets/address/${bitcoinAddress}`);
          if (response.ok) {
            const existingWallet = await response.json();
            if (existingWallet.taprootAddress) {
              setWallet(existingWallet);
              return;
            }
          }
          
          // Wallet doesn't exist, create it automatically
          console.log("Creating new ByteStream wallet for", bitcoinAddress);
          
          // Create the wallet
          const walletResponse = await apiRequest("POST", "/api/wallets", {
            bitcoinAddress: bitcoinAddress,
          });
          const newWallet = await walletResponse.json();

          // Generate Taproot address
          const taprootResponse = await apiRequest("POST", `/api/wallets/${newWallet.id}/generate-taproot`, {
            userPublicKey: publicKey,
          });
          const walletWithTaproot = await taprootResponse.json();
          
          setWallet(walletWithTaproot);
          toast({
            title: "ByteStream Wallet Created",
            description: "Your wallet has been automatically generated and is ready to use.",
          });
        } catch (error) {
          console.error("Error checking/creating wallet:", error);
          // Silently fail - user can manually generate if needed
        } finally {
          setIsChecking(false);
        }
      }
    }
    checkOrCreateWallet();
  }, [bitcoinAddress, publicKey, wallet, setWallet, isChecking, toast]);

  const createWalletMutation = useMutation({
    mutationFn: async () => {
      // First create the wallet
      const walletResponse = await apiRequest("POST", "/api/wallets", {
        bitcoinAddress: bitcoinAddress!,
      });
      const newWallet = await walletResponse.json();

      // Then generate Taproot address
      const taprootResponse = await apiRequest("POST", `/api/wallets/${newWallet.id}/generate-taproot`, {
        userPublicKey: publicKey,
      });
      return await taprootResponse.json();
    },
    onSuccess: (data) => {
      setWallet(data);
      toast({
        title: "Wallet generated successfully",
        description: "Your ByteStream wallet is ready for use.",
      });
    },
    onError: () => {
      toast({
        title: "Generation Failed",
        description: "Could not generate Taproot address. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleGenerate = () => {
    if (!publicKey) return;
    createWalletMutation.mutate();
  };

  const handleCopy = async () => {
    if (wallet?.taprootAddress) {
      await navigator.clipboard.writeText(wallet.taprootAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const isDisabled = !bitcoinAddress;


  // Always show the card, but show loader in the address section if taproot address is not available
  return (
    <Card className={`h-full transition-all duration-300 hover:shadow-lg border-muted/50 ${isDisabled ? "opacity-50" : "hover:border-orange-500/30"} group`}>
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/30 group-hover:shadow-orange-500/50 transition-all duration-300 group-hover:scale-110">
            <WalletIcon className="w-5 h-5 text-white group-hover:rotate-12 transition-transform duration-300" />
          </div>
          <div>
            <CardTitle className="text-lg">Your ByteStream Wallet</CardTitle>
            <CardDescription>Your Taproot address for L2 deposits</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-4 rounded-lg bg-muted/50 border min-h-[96px] flex items-center justify-center">
          {wallet?.taprootAddress ? (
            <>
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Your ByteStream Wallet Address
              </Label>
              <div className="mt-2 flex items-center gap-2 w-full">
                <code className="flex-1 font-mono text-sm break-all">{wallet.taprootAddress}</code>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCopy}
                  data-testid="button-copy-taproot"
                >
                  {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </>
          ) : (
            <div className="w-full flex flex-col items-center justify-center py-4">
              <span className="relative flex h-16 w-16 items-center justify-center">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-80 z-0 border-4 border-orange-500"></span>
                <span className="relative inline-flex rounded-full h-16 w-16 bg-white border-4 border-orange-500 items-center justify-center z-10">
                  <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
                </span>
              </span>
              <span className="text-lg font-semibold text-orange-600 dark:text-orange-400 mt-4">Generating your ByteStream wallet...</span>
              <span className="text-base text-muted-foreground">This may take a few seconds.</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );

  // Only show the address section when wallet.taprootAddress is present
  return (
    <Card className={`h-full transition-all duration-300 hover:shadow-lg border-muted/50 ${isDisabled ? "opacity-50" : "hover:border-orange-500/30"} group`}>
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/30 group-hover:shadow-orange-500/50 transition-all duration-300 group-hover:scale-110">
            <WalletIcon className="w-5 h-5 text-white group-hover:rotate-12 transition-transform duration-300" />
          </div>
          <div>
            <CardTitle className="text-lg">Your ByteStream Wallet</CardTitle>
            <CardDescription>Your Taproot address for L2 deposits</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-4 rounded-lg bg-muted/50 border">
          <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Your ByteStream Wallet Address
          </Label>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 font-mono text-sm break-all">{wallet.taprootAddress}</code>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCopy}
              data-testid="button-copy-taproot"
            >
              {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function L2SettlementSection() {
  const { wallet, setWallet } = useWallet();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedSettlement, setSelectedSettlement] = useState<any>(null);
  const [visibleCount, setVisibleCount] = useState(5);
  const [settlementResult, setSettlementResult] = useState<{
    txid?: string;
    txLink?: string;
    confirmed?: boolean;
    confirmations?: number;
    message?: string;
  } | null>(null);

  // Fetch settlement history
  const { data: settlements, isLoading: isLoadingHistory } = useQuery({
    queryKey: ["/api/wallets/:walletId/settlements", wallet?.id],
    queryFn: async () => {
      if (!wallet?.id) return [];
      const response = await fetch(`/api/wallets/${wallet.id}/settlements`);
      if (!response.ok) throw new Error("Failed to fetch settlements");
      return response.json();
    },
    enabled: !!wallet?.id,
    refetchInterval: 10000, // Refetch every 10 seconds to catch confirmed settlements
  });

  // Fetch latest unsettled commitment
  const { data: latestCommitment } = useQuery({
    queryKey: ["latestCommitment", wallet?.id],
    queryFn: async () => {
      if (!wallet?.id) return null;
      
      const commitments = await fetch(`/api/wallets/${wallet.id}/l2-commitments`).then(r => r.json());
      // Find the latest unsettled commitment
      const unsettled = commitments.filter((c: any) => c.settled === "false");
      if (unsettled.length === 0) return null;
      
      // Sort by createdAt to get the most recent
      return unsettled.sort((a: any, b: any) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0];
    },
    enabled: !!wallet?.id,
    refetchInterval: 10000, // Refetch every 10 seconds
  });

  const balance = parseFloat(wallet?.l2Balance || "0");
  const hasUnsettledCommitment = !!latestCommitment;
  
  // Disable only if no wallet OR (balance is 0 AND no unsettled commitment)
  const isDisabled = !wallet || (balance === 0 && !hasUnsettledCommitment);

  const handleRefresh = async () => {
    if (!wallet?.id) return;
    setIsRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ["/api/wallets/:walletId/settlements", wallet.id] });
      await queryClient.invalidateQueries({ queryKey: ["latestCommitment", wallet.id] });
      const response = await fetch(`/api/wallets/${wallet.id}`);
      if (response.ok) {
        const updatedWallet = await response.json();
        setWallet(updatedWallet);
      }
      toast({
        title: "Data Refreshed",
        description: "Settlement data has been updated.",
      });
    } catch (error) {
      toast({
        title: "Refresh Failed",
        description: "Could not refresh data.",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Poll for confirmation status
  useEffect(() => {
    if (!settlementResult?.txid || settlementResult.confirmed) {
      return;
    }

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`https://mempool.space/testnet/api/tx/${settlementResult.txid}/status`);
        if (response.ok) {
          const status = await response.json();
          
          if (status.confirmed) {
            setSettlementResult(prev => ({
              ...prev!,
              confirmed: true,
              confirmations: 1,
              message: "Settlement confirmed on blockchain",
            }));
            
            // Refresh wallet balance after confirmation
            if (wallet) {
              const walletResponse = await fetch(`/api/wallets/${wallet.id}`);
              const updatedWallet = await walletResponse.json();
              setWallet(updatedWallet);
            }
            
            clearInterval(pollInterval);
          }
        }
      } catch (error) {
        console.error("Error polling transaction status:", error);
      }
    }, 10000); // Poll every 10 seconds

    return () => clearInterval(pollInterval);
  }, [settlementResult?.txid, settlementResult?.confirmed, wallet, setWallet]);

  // Poll for settlement in progress confirmation (independent of modal)
  useEffect(() => {
    if (!wallet?.pendingSettlementTxid || wallet.settlementInProgress !== "true") {
      return;
    }

    const pollSettlement = setInterval(async () => {
      try {
        const response = await fetch(`https://mempool.space/testnet/api/tx/${wallet.pendingSettlementTxid}/status`);
        if (response.ok) {
          const status = await response.json();
          
          if (status.confirmed) {
            console.log("Settlement confirmed, refreshing wallet...");
            
            // Refresh wallet to get updated state from backend
            const walletResponse = await fetch(`/api/wallets/${wallet.id}`);
            if (walletResponse.ok) {
              const updatedWallet = await walletResponse.json();
              setWallet(updatedWallet);
              
              toast({
                title: "Settlement Confirmed",
                description: "Your settlement has been confirmed on Bitcoin L1",
              });
            }
            
            clearInterval(pollSettlement);
          }
        }
      } catch (error) {
        console.error("Error polling settlement status:", error);
      }
    }, 5000); // Poll every 5 seconds for faster updates

    return () => clearInterval(pollSettlement);
  }, [wallet?.pendingSettlementTxid, wallet?.settlementInProgress, wallet?.id, setWallet, toast]);

  const handleSettleToL1 = async () => {
    if (!wallet) {
      toast({
        title: "No Wallet",
        description: "Please connect your wallet first",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      // Call settlement endpoint to settle both user and merchant balances on L1
      const response = await apiRequest("POST", "/api/settle-to-l1", {
        walletId: wallet.id,
      });

      const result = await response.json();

      // Set settlement result to show transaction details
      if (result.txid) {
        setSettlementResult({
          txid: result.txid,
          txLink: result.txLink || `https://mempool.space/testnet/tx/${result.txid}`,
          confirmed: result.confirmed || false,
          confirmations: 0,
          message: "Settlement transaction broadcasted. Waiting for confirmation...",
        });

        // Optimistically update wallet state to show settlement in progress immediately
        setWallet({
          ...wallet,
          settlementInProgress: "true",
          pendingSettlementTxid: result.txid,
        });

        // Open the settlement result modal
        setShowSettlementModal(true);
      }

      toast({
        title: "Settlement Initiated",
        description: "Transaction broadcasted. Waiting for confirmation...",
      });

      // Refresh wallet from server to get accurate state
      const walletResponse = await fetch(`/api/wallets/${wallet.id}`);
      const updatedWallet = await walletResponse.json();
      setWallet(updatedWallet);
    } catch (error) {
      toast({
        title: "Settlement Failed",
        description: "Could not complete settlement to L1",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className={`max-w-[480px] w-full mx-auto transition-all duration-300 hover:shadow-lg border-muted/50 ${isDisabled ? "opacity-50" : "hover:border-orange-500/30"} group`}>
      <CardHeader className="space-y-0 pb-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30 group-hover:shadow-blue-500/50 transition-all duration-300 group-hover:scale-110">
              <Bitcoin className="w-5 h-5 text-white group-hover:rotate-180 transition-transform duration-500" />
            </div>
            <div>
              <CardTitle className="text-lg">Settle to Bitcoin L1</CardTitle>
              <CardDescription>Settle user and merchant balances to Bitcoin mainnet</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              disabled={!wallet || isRefreshing}
              className="h-8 w-8"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowHistoryModal(true)}
              disabled={!wallet}
              className="text-xs"
            >
              History
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Settlement in Progress Warning */}
        {wallet?.settlementInProgress === "true" && wallet?.pendingSettlementTxid && (
          <div className="p-4 rounded-lg bg-orange-500/10 border border-orange-500/20">
            <div className="flex items-start gap-3">
              <Loader2 className="w-5 h-5 text-orange-500 animate-spin flex-shrink-0 mt-0.5" />
              <div className="space-y-2 flex-1">
                <p className="text-sm font-medium text-orange-900 dark:text-orange-100">
                  Settlement in Progress
                </p>
                <p className="text-xs text-orange-800 dark:text-orange-200">
                  Your L2 balance is locked while the settlement transaction is being confirmed on Bitcoin L1.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => window.open(`https://mempool.space/testnet/tx/${wallet.pendingSettlementTxid}`, "_blank")}
                >
                  <ExternalLink className="w-3 h-3 mr-1" />
                  View Transaction
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="p-4 rounded-lg bg-muted/50 border">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Available L2 Balance</span>
              <span className="font-mono font-medium">{formatBTC(balance)} BTC</span>
            </div>
          </div>
        </div>

        {/* Latest Unsettled Commitment */}
        {hasUnsettledCommitment && latestCommitment && (
          <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    Latest Unsettled Commitment
                  </p>
                  <p className="text-xs text-blue-800 dark:text-blue-200 mt-1">
                    Ready to settle on Bitcoin L1
                  </p>
                </div>
                <Badge variant="outline" className="text-blue-700 dark:text-blue-300 border-blue-500/30">
                  Unsettled
                </Badge>
              </div>
              <div className="space-y-3 text-sm">
                <div className="p-3 rounded-lg bg-background/50 border">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-xs text-muted-foreground">Merchant Address</span>
                    <span className="font-mono font-medium text-sm">{formatBTC(parseFloat(String(latestCommitment.amount)))} BTC</span>
                  </div>
                  <p className="font-mono text-xs break-all text-muted-foreground">{latestCommitment.merchantAddress}</p>
                </div>
                <div className="flex justify-between px-1">
                  <span className="text-xs text-muted-foreground">Transaction Fee</span>
                  <span className="font-mono font-medium text-sm">{formatBTC(parseFloat(String(latestCommitment.fee || "0")))} BTC</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              disabled={isDisabled || isLoading || wallet?.settlementInProgress === "true"}
              className="w-full"
              data-testid="button-settle-to-l1"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Settling...
                </>
              ) : wallet?.settlementInProgress === "true" ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Settlement in Progress
                </>
              ) : (
                <>
                  <ArrowRight className="w-4 h-4 mr-2" />
                  Settle to Bitcoin L1
                </>
              )}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle>Transaction Status</AlertDialogTitle>
            <AlertDialogDescription>
              {isLoading ? "Broadcasting settlement transaction..." : "Review settlement details before confirming"}
            </AlertDialogDescription>
            
            {isLoading && (
              <div className="space-y-4 py-4">
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <span className="text-sm font-medium">Status</span>
                  <Badge variant="secondary">
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    Pending
                  </Badge>
                </div>
                
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <span className="text-sm font-medium">Confirmations</span>
                  <span className="text-sm font-mono">0/1</span>
                </div>
                
                {settlementResult?.txid && (
                  <>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">TxID</Label>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 text-xs bg-muted p-2 rounded break-all">
                          {settlementResult.txid}
                        </code>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => window.open(`https://mempool.space/testnet/tx/${settlementResult.txid}`, "_blank")}
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-center p-3 rounded-lg bg-muted/50">
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      <span className="text-sm text-muted-foreground">
                        Waiting for 1 block confirmation...
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}
            
            {!isLoading && (
              <div className="flex gap-3 justify-end pt-4">
                <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleSettleToL1}
                  disabled={isLoading}
                >
                  Confirm Settlement
                </AlertDialogAction>
              </div>
            )}
          </AlertDialogContent>
        </AlertDialog>

        {/* Settlement Result Modal */}
        <Dialog open={showSettlementModal} onOpenChange={setShowSettlementModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {settlementResult?.confirmed ? (
                  <>
                    <Check className="w-5 h-5 text-green-500" />
                    Settlement Confirmed
                  </>
                ) : (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin text-orange-500" />
                    Settlement Pending
                  </>
                )}
              </DialogTitle>
              <DialogDescription>
                {settlementResult?.message || "Processing settlement..."}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 pt-4">
              {/* Broadcasting message when no txid yet - but check wallet.pendingSettlementTxid */}
              {!settlementResult?.txid && !wallet?.pendingSettlementTxid && (
                <div className="flex items-center justify-center p-4 rounded-lg bg-muted/50">
                  <Loader2 className="w-5 h-5 animate-spin text-primary mr-3" />
                  <span className="text-sm text-muted-foreground">
                    Broadcasting to Bitcoin network...
                  </span>
                </div>
              )}

              {/* Show pending settlement txid if available but not in settlementResult yet */}
              {!settlementResult?.txid && wallet?.pendingSettlementTxid && (
                <>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <span className="text-sm font-medium">Status</span>
                    <Badge variant="secondary">Pending Confirmation</Badge>
                  </div>

                  <div className="pt-2">
                    <Button
                      className="w-full"
                      variant="outline"
                      onClick={() => window.open(`https://mempool.space/testnet/tx/${wallet.pendingSettlementTxid}`, "_blank")}
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      View on Mempool Explorer
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Transaction ID</Label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs bg-muted p-2 rounded break-all">
                        {wallet.pendingSettlementTxid}
                      </code>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          await navigator.clipboard.writeText(wallet.pendingSettlementTxid!);
                          toast({
                            title: "Copied",
                            description: "Transaction ID copied to clipboard",
                          });
                        }}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="pt-4">
                    <Button
                      className="w-full"
                      onClick={() => setShowSettlementModal(false)}
                    >
                      Close
                    </Button>
                  </div>
                </>
              )}

              {/* Confirmation Status */}
              {settlementResult?.txid && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <span className="text-sm font-medium">Status</span>
                  <div className="flex items-center gap-2">
                    <Badge variant={settlementResult?.confirmed ? "default" : "secondary"}>
                      {settlementResult?.confirmed ? "Confirmed" : "Pending"}
                    </Badge>
                    <span className="text-sm font-mono text-muted-foreground">
                      {settlementResult.confirmations || 0}/1
                    </span>
                  </div>
                </div>
              )}

              {/* Transaction Link - Show immediately when txid is available */}
              {settlementResult?.txid && (
                <>
                  <div className="pt-2">
                    <Button
                      className="w-full"
                      variant="outline"
                      onClick={() => window.open(`https://mempool.space/testnet/tx/${settlementResult.txid}`, "_blank")}
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      View on Mempool Explorer
                    </Button>
                  </div>

                  {/* Transaction ID */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Transaction ID</Label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs bg-muted p-2 rounded break-all">
                        {settlementResult.txid}
                      </code>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          await navigator.clipboard.writeText(settlementResult.txid!);
                          toast({
                            title: "Copied",
                            description: "Transaction ID copied to clipboard",
                          });
                        }}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Close Button */}
                  {!settlementResult.confirmed && (
                    <div className="pt-4">
                      <Button
                        className="w-full"
                        onClick={() => setShowSettlementModal(false)}
                      >
                        Close
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Settlement History Modal */}
        <AlertDialog open={showHistoryModal} onOpenChange={setShowHistoryModal}>
          <AlertDialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <AlertDialogTitle>Settlement History</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4 pt-4">
                {isLoadingHistory ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !settlements || settlements.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No settlements found
                  </div>
                ) : (
                  <div className="space-y-3">
                    {settlements.slice(0, visibleCount).map((settlement: any) => (
                      <div 
                        key={settlement.txid} 
                        className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/5 transition-colors cursor-pointer"
                        onClick={() => setSelectedSettlement(settlement)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center bg-green-500/10 text-green-600">
                            <Check className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="font-medium">L1 Settlement</div>
                            <div className="text-xs text-muted-foreground font-mono">
                              {settlement.confirmedAt ? new Date(settlement.confirmedAt).toLocaleString('en-IN', { 
                                timeZone: 'Asia/Kolkata', 
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: true
                              }) : 'Pending'}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-green-600">
                            {formatBTC(settlement.totalAmount)} BTC
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {settlement.commitmentCount} commitment{settlement.commitmentCount > 1 ? 's' : ''}
                          </div>
                          <div className="text-xs text-orange-600">
                            Fee: {formatBTC(settlement.totalFees)} BTC
                          </div>
                        </div>
                      </div>
                    ))}
                    {settlements.length > visibleCount && (
                      <Button 
                        variant="outline" 
                        className="w-full"
                        onClick={() => setVisibleCount(prev => prev + 5)}
                      >
                        View More
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </AlertDialogDescription>
            <div className="flex justify-end pt-4">
              <AlertDialogAction onClick={() => setShowHistoryModal(false)}>
                Close
              </AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>

        {/* Settlement Details Dialog */}
        {selectedSettlement && (
          <AlertDialog open={!!selectedSettlement} onOpenChange={() => setSelectedSettlement(null)}>
            <AlertDialogContent className="max-w-2xl">
              <AlertDialogTitle>Settlement Details</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-4 pt-4">
                  {/* Status */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <span className="text-sm font-medium">Status</span>
                    <Badge variant="default">Confirmed on L1</Badge>
                  </div>

                  {/* Total Amount */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <span className="text-sm font-medium">Total Settled</span>
                    <span className="font-mono font-bold text-green-600">{formatBTC(selectedSettlement.totalAmount)} BTC</span>
                  </div>

                  {/* Network Fee */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <span className="text-sm font-medium">Network Fee</span>
                    <span className="font-mono text-orange-600">{formatBTC(selectedSettlement.totalFees)} BTC</span>
                  </div>

                  {/* Commitments Count */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <span className="text-sm font-medium">Commitments Settled</span>
                    <span className="font-mono">{selectedSettlement.commitmentCount}</span>
                  </div>

                  {/* Latest Commitment Details */}
                  {selectedSettlement.latestCommitment && (
                    <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
                      <div className="text-sm font-medium mb-2 text-blue-600">Latest Commitment</div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Amount:</span>
                          <span className="font-mono">{formatBTC(selectedSettlement.latestCommitment.amount)} BTC</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">To:</span>
                          <span className="font-mono text-xs">{formatAddress(selectedSettlement.latestCommitment.merchantAddress)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Created:</span>
                          <span className="text-xs">
                            {new Date(selectedSettlement.latestCommitment.createdAt).toLocaleString('en-IN', { 
                              timeZone: 'Asia/Kolkata', 
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: true
                            })}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Confirmation Time */}
                  {selectedSettlement.confirmedAt && (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <span className="text-sm font-medium">Confirmed At</span>
                      <span className="font-mono text-sm">
                        {new Date(selectedSettlement.confirmedAt).toLocaleString('en-IN', { 
                          timeZone: 'Asia/Kolkata', 
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                          hour12: true
                        })}
                      </span>
                    </div>
                  )}

                  {/* Transaction ID */}
                  <div className="p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Transaction ID</span>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            await navigator.clipboard.writeText(selectedSettlement.txid);
                            toast({
                              title: "Copied",
                              description: "Transaction ID copied to clipboard",
                            });
                          }}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          asChild
                        >
                          <a
                            href={`https://mempool.space/testnet/tx/${selectedSettlement.txid}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </Button>
                      </div>
                    </div>
                    <div className="font-mono text-xs break-all bg-background p-2 rounded border">
                      {selectedSettlement.txid}
                    </div>
                  </div>
                </div>
              </AlertDialogDescription>
              <div className="flex justify-end pt-4">
                <AlertDialogAction onClick={() => setSelectedSettlement(null)}>
                  Close
                </AlertDialogAction>
              </div>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </CardContent>
    </Card>
  );
}

function FundAddressSection() {
  // Context and hooks
  const { wallet, addTransaction, updateTransaction, setWallet, bitcoinAddress } = useWallet();
  const { toast } = useToast();
  const { isFundingEnabled, isEnablingFunding, enableFunding } = useFundingAuth(bitcoinAddress);
  
  // Funding state
  const [amount, setAmount] = useState("");
  const [isFunding, setIsFunding] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pendingTx, setPendingTx] = useState<{ txid: string; amount: string; id: string } | null>(null);
  const [confirmations, setConfirmations] = useState(0);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [showFundModal, setShowFundModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);

  const { data: depositHistory, isLoading: isLoadingHistory } = useQuery({
    queryKey: ["/api/wallets", wallet?.id, "transactions"],
    queryFn: async () => {
      if (!wallet?.id) return [];
      const res = await fetch(`/api/wallets/${wallet.id}/transactions`);
      if (!res.ok) throw new Error("Failed to fetch transactions");
      return res.json();
    },
    enabled: !!wallet?.id,
    refetchInterval: 5 * 60 * 1000, // Auto-refresh every 5 minutes
  });

  const handleCopyTx = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRefresh = async () => {
    if (!wallet?.id) return;
    setIsRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ["/api/wallets", wallet.id, "transactions"] });
      const response = await fetch(`/api/wallets/${wallet.id}`);
      if (response.ok) {
        const updatedWallet = await response.json();
        setWallet(updatedWallet);
      }
      toast({
        title: "Data Refreshed",
        description: "Deposit data has been updated.",
      });
    } catch (error) {
      toast({
        title: "Refresh Failed",
        description: "Could not refresh data.",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Fetch wallet balance when modal opens
  useEffect(() => {
    const fetchBalance = async () => {
      if (showFundModal && bitcoinAddress && window.unisat) {
        setIsLoadingBalance(true);
        try {
          const balance = await window.unisat.getBalance();
          // Balance is returned in satoshis, convert to BTC
          setWalletBalance(balance.total / 100000000);
        } catch (error) {
          console.error("Failed to fetch wallet balance:", error);
          setWalletBalance(null);
        } finally {
          setIsLoadingBalance(false);
        }
      }
    };
    fetchBalance();
  }, [showFundModal, bitcoinAddress]);

  const createTransactionMutation = useMutation({
    mutationFn: async (data: { walletId: string; txid: string; amount: string }) => {
      const response = await apiRequest("POST", "/api/transactions", data);
      return await response.json();
    },
  });

  const pollForConfirmation = useCallback(async (txId: string, depositAmount: string) => {
    const checkStatus = async () => {
      try {
        const response = await fetch(`/api/transactions/${txId}/status`);
        const status = await response.json();
        setConfirmations(status.confirmations || 0);

        if (status.status === "confirmed") {
          setIsConfirmed(true);
          updateTransaction(status.txid, {
            status: "confirmed",
            confirmations: status.confirmations
          });

          // Fetch updated wallet
          if (wallet) {
            const walletResponse = await fetch(`/api/wallets/${wallet.id}`);
            const updatedWallet = await walletResponse.json();
            setWallet(updatedWallet);
          }

          toast({
            title: "Transaction Confirmed",
            description: `Your L2 balance has been credited with ${depositAmount} BTC.`,
          });
          return true;
        }
        return false;
      } catch {
        return false;
      }
    };

    // Poll every 3 seconds
    const interval = setInterval(async () => {
      const confirmed = await checkStatus();
      if (confirmed) {
        clearInterval(interval);
      }
    }, 3000);

    // Also check immediately
    await checkStatus();
  }, [wallet, setWallet, updateTransaction, toast]);

  const handleFund = async () => {
    if (!wallet?.taprootAddress || !amount) return;

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid BTC amount.",
        variant: "destructive",
      });
      return;
    }

    setIsFunding(true);
    try {
      const txid = await sendBitcoinTransaction(
        wallet.bitcoinAddress,
        wallet.taprootAddress,
        amountNum
      );

      // Create transaction in backend
      const tx = await createTransactionMutation.mutateAsync({
        walletId: wallet.id,
        txid,
        amount,
      });

      addTransaction(tx);
      setPendingTx({ txid, amount, id: tx.id });
      setConfirmations(0);
      setIsConfirmed(false);
      setShowFundModal(false);

      toast({
        title: "Transaction Sent",
        description: "Waiting for blockchain confirmation...",
      });

      // Start polling for confirmation
      pollForConfirmation(tx.id, amount);

    } catch {
      toast({
        title: "Transaction Failed",
        description: "Could not send transaction. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsFunding(false);
      setAmount("");
    }
  };

  const isDisabled = !wallet;

  return (
    <>
      <Card className={`max-w-[480px] w-full mx-auto transition-all duration-300 hover:shadow-lg border-muted/50 ${isDisabled ? "opacity-50" : "hover:border-orange-500/30"} group`}>
        <CardHeader className="space-y-0 pb-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shadow-lg shadow-green-500/30 group-hover:shadow-green-500/50 transition-all duration-300 group-hover:scale-110">
                <Zap className="w-5 h-5 text-white group-hover:animate-pulse" />
              </div>
              <div>
                <CardTitle className="text-lg">Fund ByteStream Wallet</CardTitle>
                <CardDescription>Deposit BTC to your L2 wallet</CardDescription>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              disabled={!wallet || isRefreshing}
              className="h-8 w-8"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2">
            {!isFundingEnabled ? (
              <Button
                onClick={enableFunding}
                disabled={isDisabled || isEnablingFunding || wallet?.settlementInProgress === "true"}
                className="w-full"
                data-testid="button-enable-funding"
              >
                {isEnablingFunding ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Enabling...
                  </>
                ) : (
                  <>Enable Funding</>
                )}
              </Button>
            ) : (
              <>
                <Button
                  onClick={() => setShowFundModal(true)}
                  disabled={isDisabled || wallet?.settlementInProgress === "true"}
                  className="w-full"
                  data-testid="button-fund-wallet"
                >
                  <Bitcoin className="w-4 h-4 mr-2" />
                  Fund ByteStream Wallet
                </Button>
                <Button
                  onClick={() => setShowHistoryModal(true)}
                  disabled={isDisabled || wallet?.settlementInProgress === "true"}
                  variant="outline"
                  className="w-full"
                >
                  View Deposit History
                </Button>
              </>
            )}
          </div>

        {pendingTx && (
          <div className="p-4 rounded-lg border bg-card">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">Transaction Status</span>
              {isConfirmed ? (
                <Badge variant="default" className="bg-green-500/10 text-green-600 border-green-500/20">
                  <Check className="w-3 h-3 mr-1" />
                  Confirmed
                </Badge>
              ) : (
                <Badge variant="secondary">
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  Pending
                </Badge>
              )}
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-mono">{pendingTx.amount} BTC</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Confirmations</span>
                <span>{confirmations}/1</span>
              </div>
              <div className="flex justify-between items-start gap-2">
                <span className="text-muted-foreground">TxID</span>
                <a
                  href={`https://mempool.space/testnet/tx/${pendingTx.txid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs text-right max-w-[200px] break-all text-blue-500 hover:text-blue-600 hover:underline flex items-center gap-1"
                >
                  {formatAddress(pendingTx.txid, 12)}
                  <ExternalLink className="w-3 h-3 flex-shrink-0" />
                </a>
              </div>
            </div>

            {!isConfirmed && (
              <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Waiting for 1 block confirmation...
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>

      {/* Fund Modal */}
      <AlertDialog open={showFundModal} onOpenChange={setShowFundModal}>
        <AlertDialogContent>
          <AlertDialogTitle>Fund ByteStream Wallet</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4 pt-4">
              <p className="text-sm text-muted-foreground">
                Enter the amount of BTC you want to deposit to your ByteStream wallet.
              </p>

              {wallet && (
                <div className="space-y-2">
                  <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Your ByteStream Address
                  </Label>
                  <div className="p-3 rounded-lg bg-muted/50 border">
                    <code className="text-xs break-all">{wallet.taprootAddress}</code>
                  </div>
                </div>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="fund-amount">Amount (BTC)</Label>
                <Input
                  id="fund-amount"
                  type="number"
                  step="0.00000001"
                  min="0"
                  placeholder="0.00100000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={isFunding}
                  data-testid="input-btc-amount"
                  autoFocus
                />
                {isLoadingBalance ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Loading wallet balance...</span>
                  </div>
                ) : walletBalance !== null ? (
                  <p className="text-sm text-muted-foreground">
                    Available Balance: <span className="font-mono font-medium text-foreground">{formatBTC(walletBalance)} BTC</span>
                  </p>
                ) : null}
              </div>
            </div>
          </AlertDialogDescription>
          <div className="flex gap-3 justify-end pt-4">
            <AlertDialogCancel disabled={isFunding}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleFund}
              disabled={isFunding || !amount}
            >
              {isFunding ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <ArrowRight className="w-4 h-4 mr-2" />
                  Fund Wallet
                </>
              )}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Deposit History Modal */}
      <AlertDialog open={showHistoryModal} onOpenChange={setShowHistoryModal}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogTitle>Deposit Transaction History</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4 pt-4">
              {isLoadingHistory ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : !depositHistory || depositHistory.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No deposit transactions found
                </div>
              ) : (
                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                  {depositHistory.map((tx: any) => (
                    <div key={tx.id} className="p-4 rounded-lg border bg-card">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            tx.status === "confirmed" 
                              ? "bg-green-500/10 text-green-600" 
                              : "bg-yellow-500/10 text-yellow-600"
                          }`}>
                            {tx.status === "confirmed" ? (
                              <Check className="w-4 h-4" />
                            ) : (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            )}
                          </div>
                          <div>
                            <div className="font-medium">Deposit</div>
                            <div className="text-xs text-muted-foreground">
                              {tx.status === "confirmed" && tx.confirmedAt
                                ? new Date(tx.confirmedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })
                                : "Pending confirmation"}
                            </div>
                          </div>
                        </div>
                        <Badge variant={tx.status === "confirmed" ? "default" : "secondary"}>
                          {tx.status === "confirmed" ? "Confirmed" : "Pending"}
                        </Badge>
                      </div>
                      
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Amount</span>
                          <span className="font-mono font-bold">{formatBTC(tx.amount)} BTC</span>
                        </div>
                        
                        {tx.status === "confirmed" && tx.confirmations && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Confirmations</span>
                            <span>{tx.confirmations}</span>
                          </div>
                        )}
                        
                        <div className="space-y-1">
                          <span className="text-muted-foreground">Transaction ID</span>
                          <div className="flex items-center gap-2 p-2 rounded bg-muted/50">
                            <code className="flex-1 text-xs break-all">{tx.txid}</code>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0"
                              onClick={() => handleCopyTx(tx.txid)}
                            >
                              {copied ? (
                                <Check className="w-3 h-3 text-green-500" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0"
                              asChild
                            >
                              <a
                                href={`https://mempool.space/testnet/tx/${tx.txid}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </AlertDialogDescription>
          <div className="flex justify-end pt-4">
            <AlertDialogAction onClick={() => setShowHistoryModal(false)}>
              Close
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function L2BalanceSection() {
  const { wallet, setWallet, bitcoinAddress } = useWallet();
  const { toast } = useToast();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const balance = wallet?.l2Balance || "0";
  const hasBalance = parseFloat(balance) > 0;
  const isLoadingWallet = bitcoinAddress && (!wallet || !wallet.taprootAddress);

  const handleRefresh = async () => {
    if (!wallet?.id) return;
    setIsRefreshing(true);
    try {
      const response = await fetch(`/api/wallets/${wallet.id}`);
      if (response.ok) {
        const updatedWallet = await response.json();
        setWallet(updatedWallet);
        toast({
          title: "Balance Updated",
          description: "Your L2 balance has been refreshed.",
        });
      }
    } catch (error) {
      toast({
        title: "Refresh Failed",
        description: "Could not refresh balance.",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <Card className={`max-w-[480px] w-full mx-auto transition-all duration-300 hover:shadow-2xl border-border/50 ${!wallet ? "opacity-50" : "hover:border-orange-500/30"} backdrop-blur-sm bg-card/90`}>
      <CardHeader className="pb-3 border-b border-border/50">
        <div className="flex items-center justify-center">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/30">
              <Zap className="w-7 h-7 text-white" />
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-bold bg-gradient-to-r from-orange-500 to-orange-600 bg-clip-text text-transparent">
                Bitcoin Payment Layer
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Fund your wallet, and start making payments in seconds.
              </p>
            </div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-8 pb-6 space-y-6">
        {/* Address Section */}
        {isLoadingWallet ? (
          <div className="p-5 rounded-xl bg-background/60 border border-border/50">
            <div className="flex items-center gap-2 mb-3">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Your Payment Address
              </div>
            </div>
            <div className="w-full flex flex-col items-center justify-center py-8">
              <span className="relative flex h-14 w-14 items-center justify-center">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-80 z-0 border-2 border-orange-500"></span>
                <span className="relative inline-flex rounded-full h-14 w-14 bg-white border-2 border-orange-500 items-center justify-center z-10">
                  <Loader2 className="w-7 h-7 text-orange-500 animate-spin" />
                </span>
              </span>
              <span className="text-base font-semibold text-orange-600 dark:text-orange-400 mt-4">Generating your ByteStream wallet...</span>
              <span className="text-sm text-muted-foreground mt-1">This may take a few seconds.</span>
            </div>
          </div>
        ) : wallet?.taprootAddress ? (
          <div className="p-5 rounded-xl bg-background/60 border border-border/50">
            <div className="flex items-center gap-2 mb-3">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Your Payment Address
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 p-4 rounded-lg bg-card/80 border border-border/30 hover:border-orange-500/30 transition-all">
              <code className="text-sm font-mono text-foreground/80 break-all flex-grow">
                {wallet.taprootAddress}
              </code>
              <Button
                variant="ghost"
                size="icon"
                className="flex-shrink-0 h-11 w-11 rounded-lg bg-orange-500/15 hover:bg-orange-500/25 text-orange-500 transition-all hover:scale-105"
                onClick={() => {
                  navigator.clipboard.writeText(wallet.taprootAddress);
                  toast({
                    title: "Address Copied",
                    description: "Your payment address has been copied to clipboard",
                  });
                }}
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ) : null}

        {/* Balance Display */}
        <div className="text-center py-4">
          <div className="flex items-center justify-center gap-2 mb-4">
            <WalletIcon className="w-5 h-5 text-orange-500" />
            <span className="text-base text-muted-foreground font-medium">L2 Balance</span>
          </div>
          <div className="text-5xl font-bold tracking-tight mb-2">
            <span className="bg-gradient-to-r from-orange-500 to-orange-600 bg-clip-text text-transparent" data-testid="text-l2-balance">
              {formatBTC(balance)}
            </span>
            <span className="text-xl font-semibold text-muted-foreground ml-2">BTC</span>
          </div>
          
          {hasBalance && (
            <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-green-500/15 text-green-600 dark:text-green-400 font-semibold text-sm mt-4">
              <Check className="w-4 h-4" />
              Ready for instant L2 payments
            </div>
          )}
          {!hasBalance && wallet && (
            <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-muted/50 text-muted-foreground font-medium text-sm mt-4">
              <AlertCircle className="w-4 h-4" />
              Fund your wallet to get started
            </div>
          )}
        </div>
        
        {/* Refresh Button */}
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={!wallet || isRefreshing}
            className="gap-2 border-border/50 hover:border-orange-500/50 hover:bg-orange-500/5"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh Balance
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MerchantPaymentSection() {
  const { wallet, setWallet } = useWallet();
  const { toast } = useToast();
  const [merchantAddress, setMerchantAddress] = useState("");
  const [merchantAmount, setMerchantAmount] = useState("");
  const [paymentCreated, setPaymentCreated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedCommitment, setSelectedCommitment] = useState<any>(null);
  const [visibleCount, setVisibleCount] = useState(5);

  const balance = parseFloat(wallet?.l2Balance || "0");
  const isDisabled = !wallet || balance === 0;

  const handleRefresh = async () => {
    if (!wallet?.id) return;
    setIsRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ["/api/wallets/:walletId/l2-commitments", wallet.id] });
      await queryClient.invalidateQueries({ queryKey: ["/api/wallets", wallet.id] });
      const response = await fetch(`/api/wallets/${wallet.id}`);
      if (response.ok) {
        const updatedWallet = await response.json();
        setWallet(updatedWallet);
      }
      toast({
        title: "Data Refreshed",
        description: "Merchant payment data has been updated.",
      });
    } catch (error) {
      toast({
        title: "Refresh Failed",
        description: "Could not refresh data.",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Fetch L2 transaction history (commitments)
  const { data: commitments, isLoading: isLoadingHistory } = useQuery({
    queryKey: ["/api/wallets/:walletId/l2-commitments", wallet?.id],
    queryFn: async () => {
      if (!wallet?.id) return [];
      const response = await fetch(`/api/wallets/${wallet.id}/l2-commitments`);
      if (!response.ok) throw new Error("Failed to fetch L2 commitments");
      return response.json();
    },
    enabled: !!wallet?.id,
    refetchInterval: 10000, // Refetch every 10 seconds
  });

  const handleCreatePayment = async () => {
    if (!wallet || !merchantAddress || !merchantAmount) {
      toast({
        title: "Missing Information",
        description: "Please enter both merchant address and amount",
        variant: "destructive",
      });
      return;
    }

    const amount = parseFloat(merchantAmount);
    if (isNaN(amount) || amount <= 0 || amount > balance) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid amount within your balance",
        variant: "destructive",
      });
      return;
    }

    if (amount < 0.00001) {
      toast({
        title: "Amount Too Small",
        description: "Minimum payment amount is 0.00001 BTC",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      console.log("Creating merchant payment commitment...");
      // Request PSBT from backend using Taproot UTXOs
      // Include all merchants' accumulated balances as outputs for L1 settlement
      const psbtResp = await apiRequest("POST", "/api/psbt", {
        walletId: wallet.id,
        sendTo: merchantAddress,
        amount: Math.floor(amount * 100_000_000), // sats
        network: "testnet",
        includeMerchantBalances: true,
      });
      if (!psbtResp.ok) {
        const err = await psbtResp.json().catch(() => ({ error: "Failed to create PSBT" }));
        throw new Error(err.error || "Failed to create PSBT");
      }
      const { psbt: psbtData } = await psbtResp.json();

      // Sign PSBT with user's wallet
      toast({
        title: "Signing Transaction",
        description: "Please approve the transaction in your wallet...",
      });
      
      const signedPsbt = await signPsbtWithWallet(psbtData);
      console.log("SignedPSBT: ", signedPsbt);

      // Send commitment with signed PSBT to backend
      const response = await apiRequest("POST", "/api/l2-commitments", {
        walletId: wallet.id,
        merchantAddress,
        amount: amount.toString(),
        psbt: psbtData,
        userSignedPsbt: signedPsbt,
        settled: "false",
      });

      const result = await response.json();
      
      // Update wallet with new balance from the response
      if (result.payerBalance !== undefined && wallet) {
        setWallet({
          ...wallet,
          l2Balance: result.payerBalance
        });
      }
      
      setPaymentCreated(true);

      // Invalidate queries to refresh the UI
      queryClient.invalidateQueries({ queryKey: ["/api/wallets", wallet.id, "l2-commitments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallets", wallet.id] });

      toast({
        title: "Payment Created",
        description: `${merchantAmount} BTC payment to merchant created and signed`,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Could not create merchant payment";
      toast({
        title: "Failed to Create Payment",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setMerchantAddress("");
    setMerchantAmount("");
    setPaymentCreated(false);
  };

  return (
    <Card className={`max-w-[480px] w-full mx-auto h-full transition-all duration-300 hover:shadow-lg border-muted/50 ${isDisabled ? "opacity-50" : "hover:border-orange-500/30"} group`}>
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-pink-500 to-pink-600 flex items-center justify-center shadow-lg shadow-pink-500/30 group-hover:shadow-pink-500/50 transition-all duration-300 group-hover:scale-110">
            <Store className="w-5 h-5 text-white group-hover:-translate-y-1 transition-transform duration-300" />
          </div>
          <div>
            <CardTitle className="text-lg">Merchant Payment</CardTitle>
            <CardDescription>Send payment to a merchant address</CardDescription>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowHistoryModal(true)}
          disabled={!wallet}
          className="text-xs"
        >
          History
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Settlement in Progress Warning */}
        {wallet?.settlementInProgress === "true" && wallet?.pendingSettlementTxid && (
          <div className="p-4 rounded-lg bg-orange-500/10 border border-orange-500/20">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
              <div className="space-y-2 flex-1">
                <p className="text-sm font-medium text-orange-900 dark:text-orange-100">
                  Settlement in Progress
                </p>
                <p className="text-xs text-orange-800 dark:text-orange-200">
                  Cannot create new payments while settlement is being confirmed.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => window.open(`https://mempool.space/testnet/tx/${wallet.pendingSettlementTxid}`, "_blank")}
                >
                  <ExternalLink className="w-3 h-3 mr-1" />
                  View Settlement
                </Button>
              </div>
            </div>
          </div>
        )}

        {!paymentCreated ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="merchant-address">Merchant Bitcoin Address</Label>
              <Input
                id="merchant-address"
                placeholder="bc1p..."
                value={merchantAddress}
                onChange={(e) => setMerchantAddress(e.target.value)}
                disabled={isDisabled || isLoading || wallet?.settlementInProgress === "true"}
                data-testid="input-merchant-address"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="merchant-amount">Payment Amount (BTC)</Label>
              <Input
                id="merchant-amount"
                type="text"
                step="0.00000001"
                min="0"
                max={balance.toString()}
                placeholder="0.00100000"
                value={merchantAmount}
                onChange={(e) => {
                  const value = e.target.value;
                  // Allow only numbers and decimal point, with up to 8 decimal places
                  if (value === '' || /^\d*\.?\d{0,8}$/.test(value)) {
                    setMerchantAmount(value);
                  }
                }}
                disabled={isDisabled || isLoading || wallet?.settlementInProgress === "true"}
                data-testid="input-merchant-amount"
              />
              <p className="text-xs text-muted-foreground">
                Available: {formatBTC(balance)} BTC
              </p>
            </div>

            <Button
              onClick={handleCreatePayment}
              disabled={isDisabled || isLoading || !merchantAddress || !merchantAmount || wallet?.settlementInProgress === "true"}
              className="w-full"
              data-testid="button-create-merchant-payment"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating Payment...
                </>
              ) : (
                <>
                  <Bitcoin className="w-4 h-4 mr-2" />
                  Create Merchant Payment
                </>
              )}
            </Button>
          </>
        ) : (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
              <div className="flex items-center gap-2 text-green-600 mb-2">
                <Check className="w-4 h-4" />
                <span className="font-medium">Payment Created</span>
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="font-mono">{merchantAmount} BTC</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Recipient</span>
                  <span className="font-mono text-xs truncate max-w-[150px]">{merchantAddress}</span>
                </div>
              </div>
            </div>

            <Button
              onClick={handleReset}
              variant="outline"
              className="w-full"
              disabled={wallet?.settlementInProgress === "true"}
              data-testid="button-create-another-payment"
            >
              Create Another Payment
            </Button>
          </div>
        )}
      </CardContent>

      {/* L2 Transaction History Modal */}
      <AlertDialog open={showHistoryModal} onOpenChange={setShowHistoryModal}>
        <AlertDialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <AlertDialogTitle>L2 Transaction History</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4 pt-4">
              {isLoadingHistory ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : !commitments || commitments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No L2 transactions found
                </div>
              ) : (
                <div className="space-y-3">
                  {commitments.slice(0, visibleCount).map((commitment: any) => (
                    <div 
                      key={commitment.id} 
                      className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/5 transition-colors cursor-pointer"
                      onClick={() => setSelectedCommitment(commitment)}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          commitment.settled === "true" 
                            ? "bg-green-500/10"
                            : "bg-blue-500/10"
                        }`}>
                          {commitment.settled === "true" ? (
                            <Check className="w-5 h-5 text-green-600" />
                          ) : (
                            <Bitcoin className="w-5 h-5 text-blue-600" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-sm">
                            {new Date(commitment.createdAt).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                          <p className="text-xs text-muted-foreground font-mono">
                            {commitment.merchantAddress.slice(0, 12)}...{commitment.merchantAddress.slice(-8)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-mono font-bold text-sm">
                          {formatBTC(parseFloat(String(commitment.amount)))} BTC
                        </p>
                        <Badge variant={commitment.settled === "true" ? "default" : "outline"} className="mt-1">
                          {commitment.settled === "true" ? "Settled" : "Pending"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                  {commitments.length > visibleCount && (
                    <Button 
                      variant="outline" 
                      className="w-full"
                      onClick={() => setVisibleCount(prev => prev + 5)}
                    >
                      View More
                    </Button>
                  )}
                </div>
              )}
            </div>
          </AlertDialogDescription>
          <div className="flex justify-end pt-4">
            <AlertDialogAction onClick={() => setShowHistoryModal(false)}>
              Close
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Commitment Details Dialog */}
      {selectedCommitment && (
        <AlertDialog open={!!selectedCommitment} onOpenChange={() => setSelectedCommitment(null)}>
          <AlertDialogContent className="max-w-2xl">
            <AlertDialogTitle>Transaction Details</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4 pt-4">
                {/* Status */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <span className="text-sm font-medium">Status</span>
                  <Badge variant={selectedCommitment.settled === "true" ? "default" : "outline"}>
                    {selectedCommitment.settled === "true" ? "Settled on L1" : "Pending Settlement"}
                  </Badge>
                </div>

                {/* Amount */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <span className="text-sm font-medium">Amount</span>
                  <span className="font-mono font-bold text-green-600">
                    {formatBTC(parseFloat(String(selectedCommitment.amount)))} BTC
                  </span>
                </div>

                {/* Fee */}
                {selectedCommitment.fee && (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <span className="text-sm font-medium">Transaction Fee</span>
                    <span className="font-mono text-orange-600">
                      {formatBTC(parseFloat(String(selectedCommitment.fee)))} BTC
                    </span>
                  </div>
                )}

                {/* Merchant Address */}
                <div className="p-3 rounded-lg bg-muted/50">
                  <Label className="text-sm font-medium mb-2 block">Merchant Address</Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-background p-2 rounded break-all font-mono">
                      {selectedCommitment.merchantAddress}
                    </code>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        await navigator.clipboard.writeText(selectedCommitment.merchantAddress);
                        toast({
                          title: "Copied",
                          description: "Merchant address copied to clipboard",
                        });
                      }}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Created Date */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <span className="text-sm font-medium">Created</span>
                  <span className="text-sm font-mono">
                    {new Date(selectedCommitment.createdAt).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit'
                    })}
                  </span>
                </div>
              </div>
            </AlertDialogDescription>
            <div className="flex justify-end pt-4">
              <AlertDialogAction onClick={() => setSelectedCommitment(null)}>
                Close
              </AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </Card>
  );
}

function SettlementHistorySection() {
  const { wallet } = useWallet();
  const [selectedSettlement, setSelectedSettlement] = useState<any>(null);
  const [visibleCount, setVisibleCount] = useState(5);

  const { data: settlements, isLoading } = useQuery({
    queryKey: ["/api/wallets/:walletId/settlements", wallet?.id],
    queryFn: async () => {
      if (!wallet?.id) return [];
      const response = await fetch(`/api/wallets/${wallet.id}/settlements`);
      if (!response.ok) throw new Error("Failed to fetch settlements");
      return response.json();
    },
    enabled: !!wallet?.id,
    refetchInterval: 10000, // Refetch every 10 seconds to catch confirmed settlements
  });

  const handleViewMore = () => {
    setVisibleCount(prev => prev + 5);
  };

  if (!wallet) return null;

  const visibleSettlements = settlements?.slice(0, visibleCount) || [];
  const hasMore = settlements && settlements.length > visibleCount;

  return (
    <>
      <Card className="h-full transition-all duration-300 hover:shadow-lg border-muted/50 hover:border-orange-500/30">
        <CardHeader>
          <CardTitle className="text-lg">Settlement History</CardTitle>
          <CardDescription>Your L2 to L1 settlement transactions</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : !settlements || settlements.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No settlements found
            </div>
          ) : (
            <div className="max-h-[400px] overflow-y-auto pr-2 space-y-4">
              {visibleSettlements.map((settlement: any) => (
                <div 
                  key={settlement.txid} 
                  className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/5 transition-colors cursor-pointer"
                  onClick={() => setSelectedSettlement(settlement)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center bg-green-500/10 text-green-600">
                      <Check className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-medium">L1 Settlement</div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {settlement.confirmedAt ? new Date(settlement.confirmedAt).toLocaleString('en-IN', { 
                          timeZone: 'Asia/Kolkata', 
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: true
                        }) : 'Pending'}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-green-600">
                      {formatBTC(settlement.totalAmount)} BTC
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {settlement.commitmentCount} commitment{settlement.commitmentCount > 1 ? 's' : ''}
                    </div>
                    <div className="text-xs text-orange-600">
                      Fee: {formatBTC(settlement.totalFees)} BTC
                    </div>
                  </div>
                </div>
              ))}
              {hasMore && (
                <Button 
                  variant="outline" 
                  className="w-full sticky bottom-0 bg-background"
                  onClick={handleViewMore}
                >
                  View More
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Settlement Details Dialog */}
      {selectedSettlement && (
        <AlertDialog open={!!selectedSettlement} onOpenChange={() => setSelectedSettlement(null)}>
          <AlertDialogContent className="max-w-2xl">
            <AlertDialogTitle>Settlement Details</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4 pt-4">
                {/* Status */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <span className="text-sm font-medium">Status</span>
                  <Badge variant="default">Confirmed on L1</Badge>
                </div>

                {/* Total Amount */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <span className="text-sm font-medium">Total Settled</span>
                  <span className="font-mono font-bold text-green-600">{formatBTC(selectedSettlement.totalAmount)} BTC</span>
                </div>

                {/* Network Fee */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <span className="text-sm font-medium">Network Fee</span>
                  <span className="font-mono text-orange-600">{formatBTC(selectedSettlement.totalFees)} BTC</span>
                </div>

                {/* Commitments Count */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <span className="text-sm font-medium">Commitments Settled</span>
                  <span className="font-mono">{selectedSettlement.commitmentCount}</span>
                </div>

                {/* Latest Commitment Details */}
                {selectedSettlement.latestCommitment && (
                  <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
                    <div className="text-sm font-medium mb-2 text-blue-600">Latest Commitment</div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Amount:</span>
                        <span className="font-mono">{formatBTC(selectedSettlement.latestCommitment.amount)} BTC</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">To:</span>
                        <span className="font-mono text-xs">{formatAddress(selectedSettlement.latestCommitment.merchantAddress)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Created:</span>
                        <span className="text-xs">
                          {new Date(selectedSettlement.latestCommitment.createdAt).toLocaleString('en-IN', { 
                            timeZone: 'Asia/Kolkata', 
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Confirmation Time */}
                {selectedSettlement.confirmedAt && (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <span className="text-sm font-medium">Confirmed At</span>
                    <span className="font-mono text-sm">
                      {new Date(selectedSettlement.confirmedAt).toLocaleString('en-IN', { 
                        timeZone: 'Asia/Kolkata', 
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: true
                      })}
                    </span>
                  </div>
                )}

                {/* Transaction ID */}
                <div className="p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Transaction ID</span>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          await navigator.clipboard.writeText(selectedSettlement.txid);
                        }}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        asChild
                      >
                        <a
                          href={`https://mempool.space/testnet/tx/${selectedSettlement.txid}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </Button>
                    </div>
                  </div>
                  <div className="font-mono text-xs break-all bg-background p-2 rounded border">
                    {selectedSettlement.txid}
                  </div>
                </div>
              </div>
            </AlertDialogDescription>
            <div className="flex justify-end pt-4">
              <AlertDialogAction onClick={() => setSelectedSettlement(null)}>
                Close
              </AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}

function TransactionHistorySection() {
  const { wallet } = useWallet();
  const [selectedTx, setSelectedTx] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [visibleCount, setVisibleCount] = useState(4);

  const { data: history, isLoading } = useQuery({
    queryKey: ["/api/wallets", wallet?.id, "l2-commitments"],
    queryFn: async () => {
      if (!wallet?.id) return [];
      const res = await fetch(`/api/wallets/${wallet.id}/l2-commitments`);
      if (!res.ok) throw new Error("Failed to fetch history");
      return res.json();
    },
    enabled: !!wallet?.id,
  });

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleViewMore = () => {
    setVisibleCount(prev => prev + 5);
  };

  if (!wallet) return null;

  const visibleHistory = history?.slice(0, visibleCount) || [];
  const hasMore = history && history.length > visibleCount;

  return (
    <>
      <Card className="h-full transition-all duration-300 hover:shadow-lg border-muted/50 hover:border-orange-500/30">
        <CardHeader>
          <CardTitle className="text-lg">L2 Transaction History</CardTitle>
          <CardDescription>Your recent L2 payments</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : !history || history.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No transactions found
            </div>
          ) : (
            <div className="max-h-[400px] overflow-y-auto pr-2 space-y-4">
              {visibleHistory.map((tx: any) => (
                <div 
                  key={tx.id} 
                  className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/5 transition-colors cursor-pointer"
                  onClick={() => setSelectedTx(tx)}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${tx.settled === "true" ? "bg-green-500/10 text-green-600" : "bg-blue-500/10 text-blue-600"
                      }`}>
                      {tx.settled === "true" ? <Check className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
                    </div>
                    <div>
                      <div className="font-medium">
                        {tx.settled === "true" ? "Settled to L1" : "L2 Payment"}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {new Date(tx.createdAt).toLocaleString('en-IN', { 
                          timeZone: 'Asia/Kolkata', 
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: true
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">
                      -{formatBTC(
                        tx.fee && parseFloat(tx.fee) > 0
                          ? (parseFloat(tx.amount) + parseFloat(tx.fee)).toFixed(8)
                          : tx.amount
                      )} BTC
                    </div>
                    {tx.fee && parseFloat(tx.fee) > 0 && (
                      <div className="text-xs text-orange-600">
                        Fee: {formatBTC(tx.fee)} BTC
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground truncate max-w-[100px]">
                      To: {formatAddress(tx.merchantAddress)}
                    </div>
                  </div>
                </div>
              ))}
              {hasMore && (
                <Button 
                  variant="outline" 
                  className="w-full sticky bottom-0 bg-background"
                  onClick={handleViewMore}
                >
                  View More
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transaction Details Dialog */}
      {selectedTx && (
        <AlertDialog open={!!selectedTx} onOpenChange={() => setSelectedTx(null)}>
          <AlertDialogContent className="max-w-2xl">
            <AlertDialogTitle>Transaction Details</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4 pt-4">
                {/* Status */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <span className="text-sm font-medium">Status</span>
                  <Badge variant={selectedTx.settled === "true" ? "default" : "secondary"}>
                    {selectedTx.settled === "true" ? "Settled to L1" : "L2 Commitment"}
                  </Badge>
                </div>

                {/* Amount */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <span className="text-sm font-medium">Amount</span>
                  <span className="font-mono font-bold">{formatBTC(selectedTx.amount)} BTC</span>
                </div>

                {/* Fee */}
                {selectedTx.fee && parseFloat(selectedTx.fee) > 0 && (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <span className="text-sm font-medium">Network Fee</span>
                    <span className="font-mono text-orange-600">{formatBTC(selectedTx.fee)} BTC</span>
                  </div>
                )}

                {/* Total Deducted */}
                {selectedTx.fee && parseFloat(selectedTx.fee) > 0 && (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border-2 border-primary/20">
                    <span className="text-sm font-medium">Total Deducted</span>
                    <span className="font-mono font-bold text-primary">
                      {formatBTC((parseFloat(selectedTx.amount) + parseFloat(selectedTx.fee)).toFixed(8))} BTC
                    </span>
                  </div>
                )}

                {/* Merchant Address */}
                <div className="space-y-2">
                  <span className="text-sm font-medium">Merchant Address</span>
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                    <code className="flex-1 text-xs break-all">{selectedTx.merchantAddress}</code>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleCopy(selectedTx.merchantAddress)}
                    >
                      {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>

                {/* Created At */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <span className="text-sm font-medium">Created</span>
                  <span className="text-sm font-mono">{new Date(selectedTx.createdAt).toLocaleString('en-IN', { 
                    timeZone: 'Asia/Kolkata', 
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                  })}</span>
                </div>

                {/* Transaction ID */}
                <div className="space-y-2">
                  <span className="text-sm font-medium">Commitment ID</span>
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                    <code className="flex-1 text-xs break-all">{selectedTx.id}</code>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleCopy(selectedTx.id)}
                    >
                      {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>

                {/* Settlement TX ID */}
                {selectedTx.settlementTxid && (
                  <div className="space-y-2">
                    <span className="text-sm font-medium">Settlement Transaction</span>
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                      <code className="flex-1 text-xs break-all">{selectedTx.settlementTxid}</code>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleCopy(selectedTx.settlementTxid)}
                      >
                        {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        asChild
                      >
                        <a
                          href={`https://mempool.space/testnet/tx/${selectedTx.settlementTxid}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
            <div className="flex justify-end pt-4">
              <AlertDialogAction onClick={() => setSelectedTx(null)}>
                Close
              </AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}

export default function Home() {
  const { wallet, bitcoinAddress, publicKey, error, setWallet } = useWallet(); // Added bitcoinAddress and error from original
  const { toast } = useToast();
  const [isChecking, setIsChecking] = useState(false);
  const [activeSection, setActiveSection] = useState<Section>('home');

  // Redirect to home when wallet is disconnected
  useEffect(() => {
    if (!bitcoinAddress && activeSection !== 'home') {
      setActiveSection('home');
    }
  }, [bitcoinAddress, activeSection]);

  // Auto-create wallet when user connects
  useEffect(() => {
    async function checkOrCreateWallet() {
      if (bitcoinAddress && !wallet && publicKey && !isChecking) {
        setIsChecking(true);
        try {
          // First, check if wallet already exists
          const response = await fetch(`/api/wallets/address/${bitcoinAddress}`);
          if (response.ok) {
            const existingWallet = await response.json();
            if (existingWallet.taprootAddress) {
              setWallet(existingWallet);
              return;
            }
          }
          
          // Wallet doesn't exist, create it automatically
          console.log("Creating new ByteStream wallet for", bitcoinAddress);
          
          // Create the wallet
          const walletResponse = await apiRequest("POST", "/api/wallets", {
            bitcoinAddress: bitcoinAddress,
          });
          const newWallet = await walletResponse.json();

          // Generate Taproot address
          const taprootResponse = await apiRequest("POST", `/api/wallets/${newWallet.id}/generate-taproot`, {
            userPublicKey: publicKey,
          });
          const walletWithTaproot = await taprootResponse.json();
          
          setWallet(walletWithTaproot);
          toast({
            title: "ByteStream Wallet Created",
            description: "Your wallet has been automatically generated and is ready to use.",
          });
        } catch (error) {
          console.error("Error checking/creating wallet:", error);
          // Silently fail - user can manually generate if needed
        } finally {
          setIsChecking(false);
        }
      }
    }
    checkOrCreateWallet();
  }, [bitcoinAddress, publicKey, wallet, setWallet, isChecking, toast]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-orange-500/5 relative overflow-hidden">
      {/* Animated Bitcoin background pattern */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.02]">
        <div className="absolute top-20 left-10 animate-float-slow">
          <Bitcoin className="w-32 h-32 text-orange-500" />
        </div>
        <div className="absolute top-40 right-20 animate-float-slower">
          <Bitcoin className="w-24 h-24 text-orange-500" />
        </div>
        <div className="absolute bottom-40 left-1/4 animate-float-slow" style={{ animationDelay: '2s' }}>
          <Bitcoin className="w-28 h-28 text-orange-500" />
        </div>
        <div className="absolute bottom-20 right-1/3 animate-float-slower" style={{ animationDelay: '1s' }}>
          <Bitcoin className="w-36 h-36 text-orange-500" />
        </div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-float-slow" style={{ animationDelay: '3s' }}>
          <Bitcoin className="w-40 h-40 text-orange-500" />
        </div>
      </div>
      <Header activeSection={activeSection} onNavigate={setActiveSection} />

      <main className="max-w-none px-0 pt-28 pb-16 space-y-12">
        {/* Only show hero section when on home and not connected */}
        {activeSection === 'home' && !bitcoinAddress && (
          <div className="space-y-6 text-center mb-12 px-4 animate-fade-in">
            <div className="inline-block">
              <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-orange-500/10 border border-orange-500/20 mb-6">
                <Zap className="w-4 h-4 text-orange-500" />
                <span className="text-sm font-semibold text-orange-500">Lightning-Fast Bitcoin L2 Payments</span>
              </div>
            </div>
            <h1 className="text-5xl md:text-6xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              Bitcoin Payment Layer
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Fund it, and start making payments in seconds.
            </p>
          </div>
        )}

        {error && (
          <div className="max-w-2xl mx-auto px-4">
            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center gap-3 animate-fade-in">
              <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          </div>
        )}

        {!bitcoinAddress && (
          <Card className="mb-8 border-orange-500/20 bg-orange-500/5 max-w-xl mx-auto shadow-lg hover:shadow-xl transition-shadow animate-fade-in">
            <CardContent className="py-8 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/30">
                <WalletIcon className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold mb-3">Connect Your Wallet</h2>
              <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                Connect your Bitcoin wallet to get started with instant L2 payments on ByteStream.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Conditional Section Rendering */}
        <div className="max-w-3xl mx-auto px-4">
          {activeSection === 'home' && bitcoinAddress && (
            <div className="flex justify-center">
              <L2BalanceSection />
            </div>
          )}

          {activeSection === 'fund' && (
            <div className="animate-fade-in pt-24">
              <FundAddressSection />
            </div>
          )}

          {activeSection === 'merchant' && (
            <div className="animate-fade-in pt-24">
              <MerchantPaymentSection />
            </div>
          )}

          {activeSection === 'settle' && (
            <div className="animate-fade-in pt-24">
              <L2SettlementSection />
            </div>
          )}
        </div>

        {/* Why ByteStream L2 Section */}
        <div className="space-y-6 py-8 mt-16 max-w-5xl mx-auto">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold">Why ByteStream L2?</h2>
            <p className="text-muted-foreground">Fast, secure, and cost effective Bitcoin payments</p>
          </div>
          
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="bg-card/50 border-border/50">
              <CardContent className="pt-6">
                <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center mb-4">
                  <Zap className="w-5 h-5 text-orange-500" />
                </div>
                <h3 className="font-semibold mb-2">Instant Payments</h3>
                <p className="text-sm text-muted-foreground">
                  Process Bitcoin transactions in milliseconds with Layer 2 technology. No more waiting for confirmations.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border-border/50">
              <CardContent className="pt-6">
                <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center mb-4">
                  <AlertCircle className="w-5 h-5 text-orange-500" />
                </div>
                <h3 className="font-semibold mb-2">Secure & Trustless</h3>
                <p className="text-sm text-muted-foreground">
                  Built on Taproot technology with cryptographic security. Your funds remain under your control at all times.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border-border/50">
              <CardContent className="pt-6">
                <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center mb-4">
                  <Bitcoin className="w-5 h-5 text-orange-500" />
                </div>
                <h3 className="font-semibold mb-2">Low Fees</h3>
                <p className="text-sm text-muted-foreground">
                  Significantly reduced transaction costs compared to on-chain Bitcoin payments. Perfect for micropayments.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* How It Works Section */}
        <div className="space-y-6 py-8 max-w-5xl mx-auto">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold">How It Works</h2>
            <p className="text-muted-foreground">Get started with ByteStream in four simple steps</p>
          </div>
          
          <div className="grid gap-6 md:grid-cols-4">
            <div className="text-center space-y-3">
              <div className="w-12 h-12 mx-auto rounded-full bg-orange-500 text-white flex items-center justify-center font-bold">
                1
              </div>
              <h3 className="font-semibold">Connect Wallet</h3>
              <p className="text-sm text-muted-foreground">
                Your taproot address will be generated automatically for deposits
              </p>
            </div>

            <div className="text-center space-y-3">
              <div className="w-12 h-12 mx-auto rounded-full bg-orange-500 text-white flex items-center justify-center font-bold">
                2
              </div>
              <h3 className="font-semibold">Fund Wallet</h3>
              <p className="text-sm text-muted-foreground">
                Deposit bitcoins to your L2 wallet
              </p>
            </div>

            <div className="text-center space-y-3">
              <div className="w-12 h-12 mx-auto rounded-full bg-orange-500 text-white flex items-center justify-center font-bold">
                3
              </div>
              <h3 className="font-semibold">Make Payments</h3>
              <p className="text-sm text-muted-foreground">
                Send instant payments to merchants
              </p>
            </div>

            <div className="text-center space-y-3">
              <div className="w-12 h-12 mx-auto rounded-full bg-orange-500 text-white flex items-center justify-center font-bold">
                4
              </div>
              <h3 className="font-semibold">Settle to L1</h3>
              <p className="text-sm text-muted-foreground">
                Settle funds back on Bitcoin mainnet
              </p>
            </div>
          </div>
        </div>

      </main>

      {/* Footer Section */}
      <footer className="mt-16 bg-[#1a1d29]/95 backdrop-blur-md border-t border-gray-800/50 shadow-2xl">
        <div className="px-3 md:px-6 py-12">
          <div className="grid gap-12 md:grid-cols-4">
            {/* ByteStream Info */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center">
                  <Bitcoin className="w-4 h-4 text-white" />
                </div>
                <span className="font-semibold text-white">ByteStream</span>
              </div>
              <p className="text-sm text-gray-400 leading-relaxed">
                Instant Bitcoin L2 payments with Taproot technology. Fast, secure, and decentralized.
              </p>
            </div>

            {/* Product Links */}
            <div className="space-y-4">
              <h4 className="font-semibold text-sm text-white">Product</h4>
              <ul className="space-y-3 text-sm text-gray-400">
                <li>
                  <a href="#" className="hover:text-orange-500 transition-colors">L2 Wallet</a>
                </li>
                <li>
                  <a href="#" className="hover:text-orange-500 transition-colors">Dashboard</a>
                </li>
                <li>
                  <a href="#" className="hover:text-orange-500 transition-colors">Reports</a>
                </li>
              </ul>
            </div>

            {/* Resources Links */}
            <div className="space-y-4">
              <h4 className="font-semibold text-sm text-white">Resources</h4>
              <ul className="space-y-3 text-sm text-gray-400">
                <li>
                  <a href="#" className="hover:text-orange-500 transition-colors">Documentation</a>
                </li>
                <li>
                  <a href="#" className="hover:text-orange-500 transition-colors">API Reference</a>
                </li>
                <li>
                  <a href="#" className="hover:text-orange-500 transition-colors">Support</a>
                </li>
              </ul>
            </div>

            {/* Community Links */}
            <div className="space-y-4">
              <h4 className="font-semibold text-sm text-white">Community</h4>
              <ul className="space-y-3 text-sm text-gray-400">
                <li>
                  <a href="#" className="hover:text-orange-500 transition-colors">Twitter</a>
                </li>
                <li>
                  <a href="#" className="hover:text-orange-500 transition-colors">Discord</a>
                </li>
                <li>
                  <a href="#" className="hover:text-orange-500 transition-colors">GitHub</a>
                </li>
              </ul>
            </div>
          </div>

          {/* Footer Bottom */}
          <div className="mt-12 pt-8 border-t border-gray-800 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-gray-400">
            <p>© 2025-26 ByteStream. All rights reserved.</p>
            <div className="flex gap-6">
              <a href="#" className="hover:text-orange-500 transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-orange-500 transition-colors">Terms of Service</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

