import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { formatBTC } from "@/lib/bitcoin";
import { useWallet } from "@/lib/wallet-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Store, 
  Zap, 
  Loader2, 
  Check, 
  AlertCircle,
  ArrowLeft,
  CreditCard
} from "lucide-react";
import { Link } from "wouter";

interface MerchantData {
  id: string;
  name: string;
  walletId: string;
  paymentUrl: string;
  l2Balance: string;
}

export default function MerchantPayment() {
  const { merchantName } = useParams<{ merchantName: string }>();
  const { wallet } = useWallet();
  const { toast } = useToast();
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentComplete, setPaymentComplete] = useState(false);

  const { data: merchant, isLoading, error, refetch } = useQuery<MerchantData>({
    queryKey: ["/api/merchants/name", merchantName],
    queryFn: async () => {
      const res = await fetch(`/api/merchants/name/${merchantName}`);
      if (!res.ok) {
        throw new Error("Merchant not found");
      }
      return res.json();
    },
    enabled: !!merchantName,
  });

  const paymentMutation = useMutation({
    mutationFn: async (amount: string) => {
      const response = await apiRequest("POST", `/api/merchants/${merchantName}/pay`, {
        amount,
        payerWalletId: wallet?.id,
      });
      return response;
    },
    onSuccess: (data) => {
      setPaymentComplete(true);
      setPaymentAmount("");
      refetch();
      
      toast({
        title: "Payment Successful",
        description: `Paid ${paymentAmount} BTC to ${merchant?.name}`,
      });

      setTimeout(() => {
        setPaymentComplete(false);
      }, 3000);
    },
    onError: (error: Error) => {
      toast({
        title: "Payment Failed",
        description: error.message || "Could not process payment. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handlePayment = async () => {
    if (!merchant || !wallet || !paymentAmount) return;

    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid payment amount.",
        variant: "destructive",
      });
      return;
    }

    const balance = parseFloat(wallet.l2Balance || "0");
    if (amount > balance) {
      toast({
        title: "Insufficient Balance",
        description: "Payment amount exceeds available L2 balance.",
        variant: "destructive",
      });
      return;
    }

    paymentMutation.mutate(paymentAmount);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading merchant...</p>
        </div>
      </div>
    );
  }

  if (error || !merchant) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="py-8 text-center">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-destructive" />
            <h2 className="text-lg font-semibold mb-2">Merchant Not Found</h2>
            <p className="text-muted-foreground mb-4">
              The merchant "{merchantName}" does not exist or has been removed.
            </p>
            <Link href="/">
              <Button variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Go Home
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="h-16 border-b bg-background/95 backdrop-blur">
        <div className="max-w-lg mx-auto h-full px-6 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Back</span>
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
              <Zap className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="text-sm font-medium">ByteStream</span>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-6 py-12">
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
            <Store className="w-10 h-10 text-muted-foreground" />
          </div>
          <h1 className="text-2xl font-semibold mb-1" data-testid="text-merchant-name">
            {merchant.name}
          </h1>
          <p className="text-muted-foreground">L2 Payment Portal</p>
        </div>

        <Card className="mb-6">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Your L2 Balance</CardTitle>
            <CardDescription>Available for instant payments</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="p-6 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 text-center">
              <div className="text-3xl font-bold tracking-tight" data-testid="text-merchant-balance">
                {formatBTC(merchant.l2Balance)} <span className="text-lg font-medium text-muted-foreground">BTC</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              Make a Payment
            </CardTitle>
            <CardDescription>Pay {merchant.name} instantly with L2</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {paymentComplete ? (
              <div className="py-8 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/10 flex items-center justify-center">
                  <Check className="w-8 h-8 text-green-500" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Payment Complete</h3>
                <p className="text-muted-foreground">Your payment has been processed successfully.</p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="payment-amount">Payment Amount (BTC)</Label>
                  <Input
                    id="payment-amount"
                    type="number"
                    step="0.00000001"
                    min="0"
                    max={merchant.l2Balance}
                    placeholder="0.00100000"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    disabled={paymentMutation.isPending}
                    data-testid="input-payment-amount"
                  />
                </div>

                <Button 
                  onClick={handlePayment}
                  disabled={paymentMutation.isPending || !paymentAmount || parseFloat(paymentAmount) <= 0}
                  className="w-full"
                  data-testid="button-pay-merchant"
                >
                  {paymentMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 mr-2" />
                      Pay Merchant
                    </>
                  )}
                </Button>

                {parseFloat(merchant.l2Balance) === 0 && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <AlertCircle className="w-4 h-4" />
                    <span>No L2 balance available. Please fund your wallet first.</span>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <div className="mt-8 text-center">
          <Badge variant="secondary" className="text-xs">
            Powered by ByteStream L2
          </Badge>
        </div>
      </main>
    </div>
  );
}
