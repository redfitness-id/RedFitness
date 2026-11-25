import { m } from 'framer-motion';
// @mui
import { alpha, useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Grid from '@mui/material/Unstable_Grid2';
import Typography from '@mui/material/Typography';
// components
import Image from 'src/components/image';
import Iconify from 'src/components/iconify';
import { MotionViewport, varFade } from 'src/components/animate';
// hooks
import { useSectionContent } from 'src/hooks/use-page-content';

import InquiryInfoLink from 'src/routes/components/inquiry-info-link';

// ----------------------------------------------------------------------

const RED = '#DF2026';
const RED_DARK = '#A8171C';
const BLACK = '#060606';

export default function HomeGoalsAndDualCTA() {
  const theme = useTheme();
  const content = useSectionContent('membership', 'team');

  const renderGoalsSection = (
    <Container component={MotionViewport} sx={{ py: { xs: 10, md: 15 }, position: 'relative', zIndex: 2 }}>
      <Grid container spacing={{ xs: 5, md: 8 }} alignItems="center">
        {/* TEKS & KONTEN (KIRI) */}
        <Grid xs={12} md={6}>
          <m.div variants={varFade().inLeft}>
             <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
              <Box sx={{ width: 28, height: 2, bgcolor: RED }} />
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: 4, textTransform: 'uppercase', color: RED, fontFamily: 'monospace' }}>
                {content.goals_eyebrow}
              </Typography>
            </Stack>

            <Typography 
              variant="h2" 
              sx={{ 
                mb: 3, 
                fontWeight: 800, 
                textTransform: 'uppercase', 
                color: '#fff',
                fontFamily: "'Poppins', sans-serif",
                letterSpacing: -2,
                lineHeight: 0.95
              }}
            >
              {content.goals_title} <br />
              <Box component="span" sx={{ color: RED, fontStyle: 'italic' }}>{content.goals_title_highlight}</Box>
            </Typography>

            <Typography sx={{ color: alpha('#fff', 0.6), mb: 4, fontSize: '0.9rem', lineHeight: 1.8 }}>
              {content.goals_description}
            </Typography>

            {/* Feature Box - Sharp Corners */}
            <Box
              sx={{
                p: 4,
                mb: 5,
                borderRadius: 0, // Sharp
                bgcolor: '#080808', // Solid dark background
                border: `1px solid ${alpha(RED, 0.15)}`,
                borderLeft: `3px solid ${RED}`,
              }}
            >
              <Stack spacing={3}>
                {[content.goals_point1, content.goals_point2].map((text, index) => (
                  <Stack key={index} direction="row" alignItems="flex-start" spacing={2.5}>
                    <Iconify 
                      icon="solar:star-bold" 
                      width={20} 
                      sx={{ color: RED, mt: 0.2, flexShrink: 0 }} 
                    />
                    <Typography sx={{ color: alpha('#fff', 0.8), fontSize: '0.85rem', lineHeight: 1.6 }}>
                      {text}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            </Box>

            <Button
              component={InquiryInfoLink}
              href="/personal-training"
              variant="contained"
              size="large"
              endIcon={<Iconify icon="solar:arrow-right-up-bold" />}
              sx={{
                bgcolor: RED,
                color: '#fff',
                borderRadius: 0, // Sharp
                px: 5,
                py: 1.75,
                fontWeight: 800,
                fontSize: '0.72rem',
                fontFamily: 'monospace',
                textTransform: 'uppercase',
                letterSpacing: 2,
                boxShadow: 'none',
                '&:hover': {
                  bgcolor: RED_DARK,
                  boxShadow: 'none',
                }
              }}
            >
              Explore Personal Training
            </Button>
          </m.div>
        </Grid>

        {/* GAMBAR (KANAN) */}
        <Grid xs={12} md={6}>
          <m.div variants={varFade().inRight}>
            <Box
              sx={{
                position: 'relative',
                borderRadius: 0, // Sharp
                overflow: 'hidden',
                border: `1px solid ${alpha(RED, 0.15)}`,
              }}
            >
              <Image
                alt="crush goals"
                src="/assets/background/home/7.webp" 
                ratio="3/4"
                sx={{
                  transition: 'transform 0.5s ease',
                  '&:hover': { transform: 'scale(1.05)' },
                }}
              />
               {/* Overlay Gradient Merah-Hitam di bawah gambar */}
               <Box
                  sx={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    width: 1,
                    height: '50%',
                    background: `linear-gradient(to top, ${BLACK} 0%, transparent 100%)`,
                  }}
                />
            </Box>
          </m.div>
        </Grid>
      </Grid>
    </Container>
  );

  return (
    <Box sx={{ bgcolor: BLACK, overflow: 'hidden' }}>
      {renderGoalsSection}
    </Box>
  );
}
