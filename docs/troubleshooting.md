# Troubleshooting

## Error:`ModuleNotFoundError: No module named 'distutils'`

This might happen when executing pnpm install. Because python has moved some packages out of the core library, you need to install them separately, you can try

```shell
brew install python-setuptools

#or
pip install setuptools

#or
pip3 install setuptools
```

See more in [this link](https://stackoverflow.com/questions/69919970/no-module-named-distutils-but-distutils-installed)
