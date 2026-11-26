import { useState } from 'react';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { CONSENT_EVENT } from './consent';
import { isAnalyticsEnabled } from './gtm';

export default function AnalyticsChoice() {
  const [choice, setChoice] = useState<'granted' | 'denied' | undefined>();

  if (!isAnalyticsEnabled()) return null;

  const choose = (value: 'granted' | 'denied') => {
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: value }));
    setChoice(value);
  };

  return (
    <Paper component="aside" aria-label="Analytics preferences" sx={{ p: 2, bgcolor: 'background.paper' }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} alignItems="center" justifyContent="center" spacing={1}>
        <Typography variant="body2">
          Analytics is optional. Your choice applies until you reload or close this page.
        </Typography>
        <Button variant="outlined" aria-pressed={choice === 'granted'} onClick={() => choose('granted')}>
          Allow analytics
        </Button>
        <Button variant="outlined" aria-pressed={choice === 'denied'} onClick={() => choose('denied')}>
          Decline analytics
        </Button>
      </Stack>
    </Paper>
  );
}
