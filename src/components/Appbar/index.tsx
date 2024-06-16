import React, { forwardRef, useEffect, useState } from 'react';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import {
  Avatar,
  Backdrop,
  Button,
  FormControl,
  InputAdornment,
  ListItem,
  ListItemAvatar,
  ListItemButton,
  ListItemText,
  TextField,
} from '@mui/material';
import { Search, Translate } from '@mui/icons-material';
import { searchPlugins } from '@provider/plugins';
import { Plugin } from '@typings/plugin';
import { FixedSizeList, ListChildComponentProps } from 'react-window';
import { useDispatch, useSelector } from 'react-redux';
import { AppState } from '@redux/store';
import { selectPlugin } from '@redux/pluginSlice';

const resovleIcon = (iconPath: string) => {
  return '/icons/' + iconPath;
};

export default function () {
  const [searchedPlugins, setSearchPlugins] = useState<Plugin.PluginBase[]>([]);
  const [keyword, setKeyword] = useState('');
  const [listVisible, setListVisible] = useState(false);
  const selectedPlugin = useSelector(
    (state: AppState) => state.plugin.selected,
  );
  const dispatch = useDispatch();
  useEffect(() => {
    const plugins = searchPlugins(keyword);
    setSearchPlugins(plugins);
  }, [keyword]);

  function renderPlugin(props: ListChildComponentProps<Plugin.PluginBase[]>) {
    const { index, style, data } = props;
    const plugin = data[index];

    return (
      <ListItem style={style} key={index} component="div" disablePadding>
        <ListItemButton
          onClick={() => {
            dispatch(
              selectPlugin({
                id: plugin.id,
                name: plugin.name,
                version: plugin.version,
                icon: plugin.icon,
                site: plugin.site,
              }),
            );
            setListVisible(false);
          }}
        >
          <ListItemAvatar>
            <Avatar variant="square" src={resovleIcon(plugin.icon)} />
          </ListItemAvatar>
          <ListItemText primary={plugin.name} />
        </ListItemButton>
      </ListItem>
    );
  }

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar position="fixed" color="inherit" elevation={0}>
        <Toolbar>
          <FormControl
            sx={{
              display: 'block',
              position: 'relative',
              zIndex: 10,
            }}
          >
            <TextField
              size="small"
              variant="outlined"
              placeholder="Seach plugin"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search />
                  </InputAdornment>
                ),
              }}
              sx={{ width: 434 }}
              onFocus={() => {
                setListVisible(true);
                if (searchedPlugins.length === 0)
                  setSearchPlugins(searchPlugins(keyword));
              }}
            />
            {listVisible ? (
              <FixedSizeList
                height={400}
                width={434}
                itemData={searchedPlugins}
                itemSize={46}
                itemCount={searchedPlugins.length}
                overscanCount={5}
                style={{
                  position: 'absolute',
                  boxShadow: '2px 10px 20px rgba(0, 0, 0, 0.2)',
                  backgroundColor: 'white',
                }}
              >
                {renderPlugin}
              </FixedSizeList>
            ) : null}
          </FormControl>
          <Backdrop
            open={listVisible}
            onClick={() => setListVisible(false)}
            sx={{ zIndex: 9 }}
            invisible={true}
          ></Backdrop>
          <InputAdornment position="end">
            <Button variant="contained" endIcon={<Translate />}>
              Language
            </Button>
          </InputAdornment>
          {selectedPlugin ? (
            <Box sx={{ pl: 2, display: 'flex', alignItems: 'center' }}>
              <Avatar
                sx={{ mr: 1 }}
                src={resovleIcon(selectedPlugin.icon)}
                variant="square"
              />
              <a href={selectedPlugin.site} target="_blank">
                {selectedPlugin.name} - v{selectedPlugin.version}
              </a>
            </Box>
          ) : null}
        </Toolbar>
      </AppBar>
    </Box>
  );
}
