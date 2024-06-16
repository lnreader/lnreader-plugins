import React, { ReactNode, useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';

export default function CopiableItem({
  content,
  children,
}: {
  content?: string;
  children: ReactNode;
}) {
  const [alertVisible, setAlertVisble] = useState(false);
  useEffect(() => {
    if (alertVisible) {
      setTimeout(() => setAlertVisble(false), 1000);
    }
  }, [alertVisible]);
  return (
    <div
      onClick={() => {
        if (content) {
          navigator.clipboard.writeText(content).then(() => {
            setAlertVisble(true);
          });
        }
      }}
    >
      {alertVisible ? (
        <Alert
          sx={{
            position: 'absolute',
            transform: 'translate(100%, -100%)',
            zIndex: theme => theme.zIndex.tooltip + 1,
          }}
          severity="success"
        >
          Copied
        </Alert>
      ) : null}
      {children}
    </div>
  );
}
