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
  ExternalLink
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

// Encode string data to hex without Buffer (works in browser)
const toHex = (value: string) =>
  Array.from(new TextEncoder().encode(value))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

function Header() {
  const { bitcoinAddress, isConnecting, connectWallet, disconnectWallet } = useWallet();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (bitcoinAddress) {
      await navigator.clipboard.writeText(bitcoinAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <header className="fixed top-0 left-0 right-0 h-16 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-50">
      <div className="max-w-4xl mx-auto h-full px-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Zap className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-semibold">ByteStream</span>
        </div>

        {bitcoinAddress ? (
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted hover-elevate active-elevate-2 transition-colors"
              data-testid="button-copy-address"
            >
              <WalletIcon className="w-4 h-4 text-muted-foreground" />
              <span className="font-mono text-sm">{formatAddress(bitcoinAddress)}</span>
              {copied ? (
                <Check className="w-4 h-4 text-green-500" />
              ) : (
                <Copy className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
            <Button
              variant="outline"
              size="sm"
              onClick={disconnectWallet}
              data-testid="button-disconnect"
            >
              Disconnect
            </Button>
          </div>
        ) : (
          <Button
            onClick={connectWallet}
            disabled={isConnecting}
            data-testid="button-connect-wallet"
          >
            {isConnecting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <WalletIcon className="w-4 h-4 mr-2" />
                Connect Bitcoin Wallet
              </>
            )}
          </Button>
        )}
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

  // Check if wallet exists when user connects
  useEffect(() => {
    async function checkExistingWallet() {
      if (bitcoinAddress && !wallet && publicKey) {
        setIsChecking(true);
        try {
          const response = await fetch(`/api/wallets/address/${bitcoinAddress}`);
          if (response.ok) {
            const existingWallet = await response.json();
            if (existingWallet.taprootAddress) {
              setWallet(existingWallet);
              // Don't show toast for existing wallet on load
            }
          }
        } catch (error) {
          // Wallet doesn't exist yet, user needs to generate
        } finally {
          setIsChecking(false);
        }
      }
    }
    checkExistingWallet();
  }, [bitcoinAddress, publicKey, wallet, setWallet]);

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

  return (
    <Card className={isDisabled ? "opacity-50" : ""}>
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
        <div>
          <CardTitle className="text-lg">{wallet ? "ByteStream Wallet" : "Generate ByteStream Wallet"}</CardTitle>
          <CardDescription>{wallet ? "Your Taproot address for L2 deposits" : "Create a Taproot address for L2 deposits"}</CardDescription>
        </div>
        <StepIndicator step={1} label="Generate" active={!!bitcoinAddress && !wallet} completed={!!wallet} />
      </CardHeader>
      <CardContent className="space-y-4">
        {!wallet ? (
          isChecking ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span className="ml-2 text-sm text-muted-foreground">Checking for existing wallet...</span>
            </div>
          ) : (
            <Button
              onClick={handleGenerate}
              disabled={isDisabled || createWalletMutation.isPending}
              className="w-full"
              data-testid="button-generate-wallet"
            >
              {createWalletMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating Taproot Address...
                </>
              ) : (
                <>
                  <Bitcoin className="w-4 h-4 mr-2" />
                  Generate ByteStream Wallet
                </>
              )}
            </Button>
          )
        ) : (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-muted/50 border">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Your Taproot Address
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
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function L2SettlementSection() {
  const { wallet, setWallet } = useWallet();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const balance = parseFloat(wallet?.l2Balance || "0");
  const isDisabled = !wallet || balance === 0;

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

      toast({
        title: "Settlement Initiated",
        description: "User and merchant balances are being settled on Bitcoin L1",
      });

      // Refresh wallet balance
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
    <Card className={isDisabled ? "opacity-50" : ""}>
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
        <div>
          <CardTitle className="text-lg">Settle to Bitcoin L1</CardTitle>
          <CardDescription>Settle user and merchant balances to Bitcoin mainnet</CardDescription>
        </div>
        <StepIndicator
          step={4}
          label="Settle"
          active={!!wallet && balance > 0}
          completed={false}
        />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-4 rounded-lg bg-muted/50 border">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Available L2 Balance</span>
              <span className="font-mono font-medium">{formatBTC(balance)} BTC</span>
            </div>
          </div>
        </div>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              disabled={isDisabled || isLoading}
              className="w-full"
              data-testid="button-settle-to-l1"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Settling...
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
            <AlertDialogTitle>Confirm Settlement</AlertDialogTitle>
            <AlertDialogDescription>
              This will settle all user and merchant balances on Bitcoin L1. This action cannot be undone.
            </AlertDialogDescription>
            <div className="flex gap-3 justify-end pt-4">
              <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleSettleToL1}
                disabled={isLoading}
              >
                {isLoading ? "Settling..." : "Confirm Settlement"}
              </AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

function FundAddressSection() {
  const { wallet, addTransaction, updateTransaction, setWallet } = useWallet();
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [isFunding, setIsFunding] = useState(false);
  const [pendingTx, setPendingTx] = useState<{ txid: string; amount: string; id: string } | null>(null);
  const [confirmations, setConfirmations] = useState(0);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [showFundModal, setShowFundModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [copied, setCopied] = useState(false);

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
      <Card className={isDisabled ? "opacity-50" : ""}>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
          <div>
            <CardTitle className="text-lg">Fund ByteStream Wallet</CardTitle>
            <CardDescription>Deposit BTC to your L2 wallet</CardDescription>
          </div>
          <StepIndicator
            step={2}
            label="Fund"
            active={!!wallet && !isConfirmed}
            completed={isConfirmed}
          />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button
              onClick={() => setShowFundModal(true)}
              disabled={isDisabled}
              className="flex-1"
              data-testid="button-fund-wallet"
            >
              <Bitcoin className="w-4 h-4 mr-2" />
              Fund ByteStream Wallet
            </Button>
            <Button
              onClick={() => setShowHistoryModal(true)}
              disabled={isDisabled}
              variant="outline"
              className="flex-1"
            >
              View Deposit History
            </Button>
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
                              {new Date(tx.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}
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
  const { wallet } = useWallet();
  const balance = wallet?.l2Balance || "0";
  const hasBalance = parseFloat(balance) > 0;

  return (
    <Card className={!wallet ? "opacity-50" : ""}>
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">L2 Balance</CardTitle>
        <CardDescription>Your available balance for instant payments</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="p-6 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 text-center">
          <div className="text-4xl font-bold tracking-tight" data-testid="text-l2-balance">
            {formatBTC(balance)} <span className="text-xl font-medium text-muted-foreground">BTC</span>
          </div>
          {hasBalance && (
            <p className="mt-2 text-sm text-muted-foreground">
              Ready for instant L2 payments
            </p>
          )}
          {!hasBalance && wallet && (
            <p className="mt-2 text-sm text-muted-foreground">
              Fund your wallet to get started
            </p>
          )}
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

  const balance = parseFloat(wallet?.l2Balance || "0");
  const isDisabled = !wallet || balance === 0;

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

    setIsLoading(true);
    try {
      console.log("Creating merchant payment commitment...");
      // Request PSBT from backend using Taproot UTXOs
      const psbtResp = await apiRequest("POST", "/api/psbt", {
        walletId: wallet.id,
        sendTo: merchantAddress,
        amount: Math.floor(amount * 100_000_000), // sats
        network: "testnet",
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
    <Card className={isDisabled ? "opacity-50" : ""}>
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
        <div>
          <CardTitle className="text-lg">Merchant Payment</CardTitle>
          <CardDescription>Send payment to a merchant address</CardDescription>
        </div>
        <StepIndicator
          step={3}
          label="Payment"
          active={!!wallet && balance > 0 && !paymentCreated}
          completed={paymentCreated}
        />
      </CardHeader>
      <CardContent className="space-y-4">
        {!paymentCreated ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="merchant-address">Merchant Bitcoin Address</Label>
              <Input
                id="merchant-address"
                placeholder="bc1p..."
                value={merchantAddress}
                onChange={(e) => setMerchantAddress(e.target.value)}
                disabled={isDisabled || isLoading}
                data-testid="input-merchant-address"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="merchant-amount">Payment Amount (BTC)</Label>
              <Input
                id="merchant-amount"
                type="number"
                step="0.00000001"
                min="0"
                max={balance.toString()}
                placeholder="0.00100000"
                value={merchantAmount}
                onChange={(e) => setMerchantAmount(e.target.value)}
                disabled={isDisabled || isLoading}
                data-testid="input-merchant-amount"
              />
              <p className="text-xs text-muted-foreground">
                Available: {formatBTC(balance)} BTC
              </p>
            </div>

            <Button
              onClick={handleCreatePayment}
              disabled={isDisabled || isLoading || !merchantAddress || !merchantAmount}
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
              data-testid="button-create-another-payment"
            >
              Create Another Payment
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
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
      <Card>
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
                        {new Date(tx.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">
                      -{formatBTC(tx.amount)} BTC
                    </div>
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
                  <span className="text-sm font-mono">{new Date(selectedTx.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}</span>
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
  const { wallet, bitcoinAddress, error } = useWallet(); // Added bitcoinAddress and error from original

  return (
    <div className="min-h-screen bg-background pb-20">
      <Header />

      <main className="max-w-7xl mx-auto px-6 pt-24 space-y-8">
        {!bitcoinAddress && ( // Kept connect wallet card from original
          <Card className="mb-8 border-primary/20 bg-primary/5">
            <CardContent className="py-8 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                <WalletIcon className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-lg font-semibold mb-2">Connect Your Wallet</h2>
              <p className="text-muted-foreground mb-4 max-w-md mx-auto">
                Connect your Unisat wallet to get started with ByteStream L2 payments.
              </p>
              <p className="text-xs text-muted-foreground">
                Unisat wallet extension required
              </p>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-8 lg:grid-cols-2">
          <GenerateWalletSection />
          <div className="space-y-8">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold tracking-tight">Bitcoin L2 Wallet</h1>
              <p className="text-muted-foreground">
                Generate a Taproot address, fund it, and make instant L2 payments.
              </p>
            </div>
            {error && (
              <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-destructive" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_400px]">
          <div className="space-y-8">
            <FundAddressSection />
            <L2BalanceSection />
            <MerchantPaymentSection />
            <L2SettlementSection />
          </div>

          <div className="space-y-8">
            <TransactionHistorySection />
          </div>
        </div>
      </main>
    </div>
  );
}

