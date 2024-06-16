import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  LinearProgress,
  Typography,
} from '@mui/material';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import React, { ReactNode } from 'react';

export default function AccordionContainer({
  children,
  title,
  loading,
}: {
  title: string;
  loading?: boolean;
  children: ReactNode;
}) {
  return (
    <Accordion sx={{ my: 2 }}>
      <AccordionSummary expandIcon={<ArrowDropDownIcon />}>
        <Typography sx={{ fontWeight: 600, fontSize: 20 }}>{title}</Typography>
      </AccordionSummary>
      {loading ? (
        <Box sx={{ width: '100%' }}>
          <LinearProgress />
        </Box>
      ) : null}
      <AccordionDetails sx={{ alignItems: 'flex-start' }}>
        {children}
      </AccordionDetails>
    </Accordion>
  );
}
