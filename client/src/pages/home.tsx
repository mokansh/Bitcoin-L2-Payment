import { useState, useEffect, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useWallet } from "@/lib/wallet-context";
import { generateTaprootAddress, sendBitcoinTransaction, getBitcoinTxStatus, formatAddress, formatBTC } from "@/lib/bitcoin";
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
        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
          completed 
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
        title: "ByteStream Wallet Generated",
        description: "Your Taproot address is ready for funding.",
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
          <CardTitle className="text-lg">Generate ByteStream Wallet</CardTitle>
          <CardDescription>Create a Taproot address for L2 deposits</CardDescription>
        </div>
        <StepIndicator step={1} label="Generate" active={!!bitcoinAddress && !wallet} completed={!!wallet} />
      </CardHeader>
      <CardContent className="space-y-4">
        {!wallet ? (
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
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Check className="w-4 h-4 text-green-500" />
              <span>Wallet generated successfully</span>
            </div>
          </div>
        )}
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
    <Card className={isDisabled ? "opacity-50" : ""}>
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
        <div>
          <CardTitle className="text-lg">Fund Taproot Address</CardTitle>
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
        {wallet && (
          <div className="p-4 rounded-lg bg-muted/50 border">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Deposit Address
            </Label>
            <code className="mt-2 block font-mono text-sm break-all">{wallet.taprootAddress}</code>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="amount">Amount (BTC)</Label>
          <Input
            id="amount"
            type="number"
            step="0.00000001"
            min="0"
            placeholder="0.00100000"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={isDisabled || isFunding}
            data-testid="input-btc-amount"
          />
        </div>

        <Button 
          onClick={handleFund} 
          disabled={isDisabled || isFunding || !amount}
          className="w-full"
          data-testid="button-fund-wallet"
        >
          {isFunding ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Sending Transaction...
            </>
          ) : (
            <>
              <ArrowRight className="w-4 h-4 mr-2" />
              Fund from Wallet
            </>
          )}
        </Button>

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

function MerchantSubdomainSection() {
  const { wallet, addMerchant, merchants } = useWallet();
  const { toast } = useToast();
  const [merchantName, setMerchantName] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const createMerchantMutation = useMutation({
    mutationFn: async (data: { name: string; walletId: string; paymentUrl: string }) => {
      const response = await apiRequest("POST", "/api/merchants", data);
      return await response.json();
    },
    onSuccess: (merchant) => {
      addMerchant(merchant);
      setMerchantName("");
      toast({
        title: "Merchant Created",
        description: `Your payment page is ready at ${merchant.paymentUrl}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Creation Failed",
        description: error.message || "Could not create merchant. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleCreate = async () => {
    if (!wallet || !merchantName) return;

    const sanitizedName = merchantName.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    
    if (merchants.some(m => m.name === sanitizedName)) {
      toast({
        title: "Name Taken",
        description: "This merchant name is already in use.",
        variant: "destructive",
      });
      return;
    }

    const paymentUrl = `https://${sanitizedName}.bytestream.app`;
    createMerchantMutation.mutate({
      name: sanitizedName,
      walletId: wallet.id,
      paymentUrl,
    });
  };

  const handleCopy = async (url: string) => {
    await navigator.clipboard.writeText(url);
    setCopied(url);
    setTimeout(() => setCopied(null), 2000);
  };

  const isDisabled = !wallet || parseFloat(wallet.l2Balance || "0") === 0;

  return (
    <Card className={isDisabled ? "opacity-50" : ""}>
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
        <div>
          <CardTitle className="text-lg">L2 Merchant Subdomain</CardTitle>
          <CardDescription>Create a payment page for your business</CardDescription>
        </div>
        <StepIndicator 
          step={3} 
          label="Merchant" 
          active={!!wallet && parseFloat(wallet.l2Balance || "0") > 0} 
          completed={merchants.length > 0} 
        />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="merchant-name">Merchant Name</Label>
          <div className="flex gap-2">
            <Input
              id="merchant-name"
              placeholder="my-store"
              value={merchantName}
              onChange={(e) => setMerchantName(e.target.value)}
              disabled={isDisabled || createMerchantMutation.isPending}
              data-testid="input-merchant-name"
            />
            <Button 
              onClick={handleCreate} 
              disabled={isDisabled || createMerchantMutation.isPending || !merchantName}
              data-testid="button-create-merchant"
            >
              {createMerchantMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Store className="w-4 h-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Your payment URL will be: https://{merchantName.toLowerCase().replace(/[^a-z0-9-]/g, "-") || "your-name"}.bytestream.app
          </p>
        </div>

        {merchants.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Your Merchants
            </Label>
            <div className="space-y-2">
              {merchants.map((merchant) => (
                <div 
                  key={merchant.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border"
                >
                  <div className="flex items-center gap-2">
                    <Store className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium">{merchant.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <a 
                      href={`/pay/${merchant.name}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline flex items-center gap-1"
                      data-testid={`link-merchant-${merchant.name}`}
                    >
                      Open <ExternalLink className="w-3 h-3" />
                    </a>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleCopy(merchant.paymentUrl)}
                      data-testid={`button-copy-merchant-${merchant.name}`}
                    >
                      {copied === merchant.paymentUrl ? (
                        <Check className="w-4 h-4 text-green-500" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {isDisabled && wallet && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertCircle className="w-4 h-4" />
            <span>Fund your wallet to create merchant pages</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Home() {
  const { bitcoinAddress, error } = useWallet();

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="max-w-4xl mx-auto px-6 pt-24 pb-12">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold mb-2">Bitcoin L2 Payments</h1>
          <p className="text-muted-foreground">
            Generate a Taproot wallet, fund it with BTC, and create instant merchant payment pages.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {!bitcoinAddress && (
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

        <div className="space-y-6">
          <GenerateWalletSection />
          <FundAddressSection />
          <L2BalanceSection />
          <MerchantSubdomainSection />
        </div>
      </main>
    </div>
  );
}
