import { Box, Button, Tooltip, withStyles } from '@mui/material';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import React from 'react';
import CopiableItem from './CopiableItem';

interface Validation {
  type?: 'error' | 'warning';
  message?: string;
}

const validatePath = (path: string): Validation => {
  if (path.includes('http'))
    return {
      type: 'error',
      message: 'Path must be relative, please remove the domain',
    };
  if (/^\/|\/$/.test(path)) {
    return {
      type: 'warning',
      message: 'your path should not contain leading or trailing "/"',
    };
  }
  return {};
};

export default function PathItem({ path }: { path: string }) {
  const validation = validatePath(path);
  const errorTheme = createTheme({
    components: {
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            color: '#FFF',
            backgroundColor: '#BA000D',
          },
        },
      },
    },
  });
  const warningTheme = createTheme({
    components: {
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            color: '#FFF',
            backgroundColor: 'orange',
          },
        },
      },
    },
  });
  const ValidateWrapper = validation.type ? Tooltip : Box;
  return (
    <Tooltip arrow={true} title={path} placement="bottom">
      <Box>
        <ThemeProvider
          theme={validation.type === 'error' ? errorTheme : warningTheme}
        >
          <ValidateWrapper title={validation.message} placement="top">
            <Box>
              <CopiableItem content={path}>
                <Button
                  sx={{
                    width: '100%',
                    borderColor:
                      validation.type === 'error'
                        ? 'red'
                        : validation.type === 'warning'
                          ? 'orange'
                          : undefined,
                  }}
                  variant="outlined"
                >
                  Path
                </Button>
              </CopiableItem>
            </Box>
          </ValidateWrapper>
        </ThemeProvider>
      </Box>
    </Tooltip>
  );
}
