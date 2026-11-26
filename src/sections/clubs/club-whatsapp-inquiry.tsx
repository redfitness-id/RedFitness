import { useState } from 'react';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { eligibleClubs, Service, services, whatsappUrl } from './whatsapp-routing';

const availableServices = (Object.keys(services) as Service[]).filter(service => eligibleClubs(service).length);

export default function ClubWhatsAppInquiry() {
  const [service, setService] = useState<Service | ''>('');
  const [clubName, setClubName] = useState('');
  const clubs = service ? eligibleClubs(service) : [];
  const club = clubs.find(contact => contact.name === clubName);
  const url = club && service ? whatsappUrl(club, service) : null;

  if (!availableServices.length) return null;

  return (
    <Container component="section" maxWidth="md" sx={{ py: { xs: 4, md: 6 } }}>
      <Stack spacing={2}>
        <Typography variant="h4" component="h2">Hubungi Klub via WhatsApp</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            select
            fullWidth
            label="Pilih layanan"
            value={service}
            onChange={event => {
              const selected = availableServices.find(option => option === event.target.value);
              setService(selected ?? '');
              setClubName('');
            }}
          >
            {availableServices.map(option => (
              <MenuItem key={option} value={option}>{services[option]}</MenuItem>
            ))}
          </TextField>
          <TextField
            select
            fullWidth
            disabled={!service}
            label="Pilih klub"
            value={clubName}
            onChange={event => setClubName(event.target.value)}
          >
            {clubs.map(contact => (
              <MenuItem key={contact.name} value={contact.name}>{contact.name}</MenuItem>
            ))}
          </TextField>
          {url && (
            <Button variant="contained" href={url} target="_blank" rel="noopener noreferrer" sx={{ whiteSpace: 'nowrap' }}>
              Buka WhatsApp
            </Button>
          )}
        </Stack>
      </Stack>
    </Container>
  );
}
