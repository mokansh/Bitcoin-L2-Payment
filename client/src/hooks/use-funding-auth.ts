import { useState, useEffect } from 'react';
import { useToast } from './use-toast';

export function useFundingAuth(bitcoinAddress: string | null) {
  const { toast } = useToast();
  const [isFundingEnabled, setIsFundingEnabled] = useState(false);
  const [isEnablingFunding, setIsEnablingFunding] = useState(false);

  // Check if funding is already enabled from session
  useEffect(() => {
    if (window.sessionStorage.getItem('isFundingEnabled') === 'true') {
      setIsFundingEnabled(true);
    }
  }, []);

  const enableFunding = async () => {
    if (!bitcoinAddress || !window.unisat) {
      toast({
        title: 'Connection Required',
        description: 'Please connect your wallet first.',
        variant: 'destructive'
      });
      return;
    }

    setIsEnablingFunding(true);
    try {
      const message = `Enable funding for ${bitcoinAddress} at ${new Date().toISOString()}`;
      const signature = await window.unisat.signMessage(message);
      
      const res = await fetch('/api/auth/verify-signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: bitcoinAddress, message, signature })
      });

      if (res.ok) {
        setIsFundingEnabled(true);
        window.sessionStorage.setItem('isFundingEnabled', 'true');
        toast({
          title: 'Funding Enabled',
          description: 'You can now fund your ByteStream wallet.'
        });
      } else {
        toast({
          title: 'Authentication Failed',
          description: 'Signature verification failed. Please try again.',
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Signature error:', error);
      toast({
        title: 'Signature Error',
        description: 'Could not sign message. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsEnablingFunding(false);
    }
  };

  return {
    isFundingEnabled,
    isEnablingFunding,
    enableFunding
  };
}
