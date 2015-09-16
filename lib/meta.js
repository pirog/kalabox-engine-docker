'use strict';

module.exports = {
  PROVIDER_PROFILE_VERSION: '0.10.0',
  PROVIDER_PROFILE_URL: 'https://raw.githubusercontent.com/' +
    'kalabox/kalabox-boot2docker/master/profile',
  PROVIDER_INF_VERSION: '0.10.0',
  PROVIDER_INF_URL: 'https://raw.githubusercontent.com/kalabox/' +
    'kalabox-boot2docker/master/b2d.inf',
  PROVIDER_VB_VERSION: '5.0.2',
  PROVIDER_B2D_VERSION: '1.8.0',
  PROVIDER_DOWNLOAD_URL: {
    linux: {
      vb: {
        ubuntu: {
          '12.04': 'http://download.virtualbox.org/virtualbox/5.0.2/' +
            'virtualbox-5.0_5.0.2-102096~Ubuntu~precise_amd64.deb',
          '12.10': 'http://download.virtualbox.org/virtualbox/5.0.2/' +
            'virtualbox-5.0_5.0.2-102096~Ubuntu~trusty_amd64.deb',
          '13.04': 'http://download.virtualbox.org/virtualbox/5.0.2/' +
            'virtualbox-5.0_5.0.2-102096~Ubuntu~trusty_amd64.deb',
          '13.10': 'http://download.virtualbox.org/virtualbox/5.0.2/' +
            'virtualbox-5.0_5.0.2-102096~Ubuntu~trusty_amd64.deb',
          '14.04': 'http://download.virtualbox.org/virtualbox/5.0.2/' +
            'virtualbox-5.0_5.0.2-102096~Ubuntu~trusty_amd64.deb',
          '14.10': 'http://download.virtualbox.org/virtualbox/5.0.2/' +
            'virtualbox-5.0_5.0.2-102096~Ubuntu~trusty_amd64.deb',
          '15.04': 'http://download.virtualbox.org/virtualbox/5.0.2/' +
            'virtualbox-5.0_5.0.2-102096~Ubuntu~trusty_amd64.deb',
          '15.10': 'http://download.virtualbox.org/virtualbox/5.0.2/' +
            'virtualbox-5.0_5.0.2-102096~Ubuntu~trusty_amd64.deb'
        },
        debian: {
          '6': 'http://download.virtualbox.org/virtualbox/5.0.2/' +
            'virtualbox-5.0_5.0.2-102096~Debian~squeeze_amd64.deb',
          '7': 'http://download.virtualbox.org/virtualbox/5.0.2/' +
            'virtualbox-5.0_5.0.2-102096~Debian~wheezy_amd64.deb',
          '8': 'http://download.virtualbox.org/virtualbox/5.0.2/' +
            'virtualbox-5.0_5.0.2-102096~Debian~jessie_amd64.deb'
        },
        fedora: {
          '18': 'http://download.virtualbox.org/virtualbox/5.0.2/' +
            'VirtualBox-5.0-5.0.2_102096_fedora18-1.x86_64.rpm',
          '19': 'http://download.virtualbox.org/virtualbox/5.0.2/' +
            'VirtualBox-5.0-5.0.2_102096_fedora18-1.x86_64.rpm',
          '20': 'http://download.virtualbox.org/virtualbox/5.0.2/' +
            'VirtualBox-5.0-5.0.2_102096_fedora18-1.x86_64.rpm',
          '21': 'http://download.virtualbox.org/virtualbox/5.0.2/' +
            'VirtualBox-5.0-5.0.2_102096_fedora18-1.x86_64.rpm',
          '22': 'http://download.virtualbox.org/virtualbox/5.0.2/' +
            'VirtualBox-5.0-5.0.2_102096_fedora22-1.x86_64.rpm'
        }
      },
      b2d: 'https://github.com/boot2docker/boot2docker-cli/releases/download/' +
        'v1.8.0/boot2docker-v1.8.0-linux-amd64'
    },
    win32: {
      b2d: 'https://github.com/boot2docker/windows-installer/releases/' +
      'download/v1.8.0/docker-install.exe'
    },
    darwin: {
      b2d: 'https://github.com/boot2docker/osx-installer/releases/download/' +
      'v1.8.0/Boot2Docker-1.8.0.pkg'
    }
  }
};
