import { useState, useEffect } from 'react';
import { useToast } from './use-toast';

const FUNDING_AUTH_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

export function useFundingAuth(bitcoinAddress: string | null) {
  const { toast } = useToast();
  const [isFundingEnabled, setIsFundingEnabled] = useState(false);
  const [isEnablingFunding, setIsEnablingFunding] = useState(false);

  // Check if funding is already enabled from session and not expired
  useEffect(() => {
    const checkFundingAuth = () => {
      const enabledTimestamp = window.sessionStorage.getItem('fundingEnabledAt');
      const isEnabled = window.sessionStorage.getItem('isFundingEnabled') === 'true';
      
      if (isEnabled && enabledTimestamp) {
        const elapsedTime = Date.now() - parseInt(enabledTimestamp, 10);
        
        if (elapsedTime < FUNDING_AUTH_DURATION) {
          setIsFundingEnabled(true);
          
          // Set a timeout to disable funding when session expires
          const remainingTime = FUNDING_AUTH_DURATION - elapsedTime;
          const timeoutId = setTimeout(() => {
            setIsFundingEnabled(false);
            window.sessionStorage.removeItem('isFundingEnabled');
            window.sessionStorage.removeItem('fundingEnabledAt');
            toast({
              title: 'Funding Session Expired',
              description: 'Please enable funding again to continue.',
              variant: 'default'
            });
          }, remainingTime);
          
          return () => clearTimeout(timeoutId);
        } else {
          // Session expired, clear storage
          window.sessionStorage.removeItem('isFundingEnabled');
          window.sessionStorage.removeItem('fundingEnabledAt');
          setIsFundingEnabled(false);
        }
      }
    };
    
    checkFundingAuth();
  }, [toast]);

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
        const timestamp = Date.now().toString();
        setIsFundingEnabled(true);
        window.sessionStorage.setItem('isFundingEnabled', 'true');
        window.sessionStorage.setItem('fundingEnabledAt', timestamp);
        
        toast({
          title: 'Funding Enabled',
          description: 'You can now fund your ByteStream wallet for the next 5 minutes.'
        });
        
        // Auto-disable after 5 minutes
        setTimeout(() => {
          setIsFundingEnabled(false);
          window.sessionStorage.removeItem('isFundingEnabled');
          window.sessionStorage.removeItem('fundingEnabledAt');
          toast({
            title: 'Funding Session Expired',
            description: 'Please enable funding again to continue.',
            variant: 'default'
          });
        }, FUNDING_AUTH_DURATION);
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
