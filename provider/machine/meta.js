'use strict';

// Constants
var PROVIDER_VB_VERSION = '5.0.10';
var PROVIDER_KALABOX_ISO = '1.9.1';
var PROVIDER_MACHINE_VERSION = '0.5.2';
var PROVIDER_MSYSGIT_VERSION = 'Git-1.9.5-preview20150319';

module.exports = {
  PROVIDER_VB_VERSION: PROVIDER_VB_VERSION,
  PROVIDER_KALABOX_ISO: PROVIDER_KALABOX_ISO,
  PROVIDER_MSYSGIT_VERSION: PROVIDER_MSYSGIT_VERSION,
  PROVIDER_MACHINE_VERSION: PROVIDER_MACHINE_VERSION,
  PROVIDER_DOWNLOAD_URL: {
    linux: {
      vb: {
        debian: {
          'deps': [],
          'packages': ['virtualbox-5.0'],
          'source': 'http://download.virtualbox.org/virtualbox/debian',
          'source-file': '/etc/apt/sources.list.d/kalabox.list',
          'key': 'https://www.virtualbox.org/download/oracle_vbox.asc',
          'recompile': '/etc/init.d/vboxdrv setup'
        },
        fedora: {
          'deps': [
            'binutils',
            'qt',
            'gcc',
            'make',
            'patch',
            'libgomp',
            'glibc-headers',
            'glibc-devel',
            'kernel-headers',
            'kernel-devel',
            'dkms'
          ],
          'packages': [
            'VirtualBox-5.0'
          ],
          'source': 'http://download.virtualbox.org/virtualbox/rpm/fedora/' +
            'virtualbox.repo',
          'source-file': '/etc/yum.repos.d/kalabox.repo',
          'key': '',
          'recompile': '/usr/lib/virtualbox/vboxdrv.sh setup'
        }
      },
      b2d: 'https://github.com/boot2docker/boot2docker-cli/releases/download/' +
        'v1.8.0/boot2docker-v1.8.0-linux-amd64'
    },
    win32: {
      vb: 'http://download.virtualbox.org/virtualbox/' + PROVIDER_VB_VERSION +
        '/VirtualBox-5.0.10-104061-Win.exe',
      machine: 'https://github.com/docker/machine/releases/download/v' +
        PROVIDER_MACHINE_VERSION + '/docker-machine_windows-amd64.zip',
      msysgit: 'https://github.com/msysgit/msysgit/releases/download/' +
        PROVIDER_MSYSGIT_VERSION + '/' + PROVIDER_MSYSGIT_VERSION + '.exe'
    },
    darwin: {
      vb: 'http://download.virtualbox.org/virtualbox/' + PROVIDER_VB_VERSION +
        '/VirtualBox-5.0.10-104061-OSX.dmg',
      machine: 'https://github.com/docker/machine/releases/download/v' +
        PROVIDER_MACHINE_VERSION + '/docker-machine_darwin-amd64.zip'
    }
  }
};
