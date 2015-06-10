'use strict';

module.exports = {
  PROVIDER_INIT_ATTEMPTS: 3,
  PROVIDER_UP_ATTEMPTS: 3,
  PROVIDER_PROFILE_URL: 'https://raw.githubusercontent.com/' +
    'kalabox/kalabox-boot2docker/master/profile',
  PROVIDER_INF_URL: 'https://raw.githubusercontent.com/kalabox/' +
    'kalabox-boot2docker/master/b2d.inf',
  PROVIDER_DOWNLOAD_URL: {
    linux: {
      vb: {
        ubuntu: {
          '10.04': 'http://download.virtualbox.org/virtualbox/4.3.22/' +
            'virtualbox-4.3_4.3.22-98236~Ubuntu~lucid_amd64.deb',
          '12.04': 'http://download.virtualbox.org/virtualbox/4.3.22/' +
            'virtualbox-4.3_4.3.22-98236~Ubuntu~precise_amd64.deb',
          '12.10': 'http://download.virtualbox.org/virtualbox/4.3.22/' +
            'virtualbox-4.3_4.3.22-98236~Ubuntu~quantal_amd64.deb',
          '13.04': 'http://download.virtualbox.org/virtualbox/4.3.22/' +
            'virtualbox-4.3_4.3.22-98236~Ubuntu~raring_amd64.deb',
          '13.10': 'http://download.virtualbox.org/virtualbox/4.3.22/' +
            'virtualbox-4.3_4.3.22-98236~Ubuntu~raring_amd64.deb',
          '14.04': 'http://download.virtualbox.org/virtualbox/4.3.22/' +
            'virtualbox-4.3_4.3.22-98236~Ubuntu~raring_amd64.deb',
          '14.10': 'http://download.virtualbox.org/virtualbox/4.3.22/' +
            'virtualbox-4.3_4.3.22-98236~Ubuntu~raring_amd64.deb',
          '15.04': 'http://download.virtualbox.org/virtualbox/4.3.22/' +
            'virtualbox-4.3_4.3.22-98236~Ubuntu~raring_amd64.deb'
        },
        debian: {
          '6': 'http://download.virtualbox.org/virtualbox/4.3.22/' +
            'virtualbox-4.3_4.3.22-98236~Debian~squeeze_amd64.deb',
          '7': 'http://download.virtualbox.org/virtualbox/4.3.22/' +
            'virtualbox-4.3_4.3.22-98236~Debian~wheezy_amd64.deb'
        },
        fedora: {
          '17': 'http://download.virtualbox.org/virtualbox/4.3.22/' +
            'VirtualBox-4.3-4.3.22_98236_fedora17-1.x86_64.rpm',
          '18': 'http://download.virtualbox.org/virtualbox/4.3.22/' +
            'VirtualBox-4.3-4.3.22_98236_fedora18-1.x86_64.rpm',
          '19': 'http://download.virtualbox.org/virtualbox/4.3.22/' +
            'VirtualBox-4.3-4.3.22_98236_fedora18-1.x86_64.rpm',
          '20': 'http://download.virtualbox.org/virtualbox/4.3.22/' +
            'VirtualBox-4.3-4.3.22_98236_fedora18-1.x86_64.rpm',
          '21': 'http://download.virtualbox.org/virtualbox/4.3.22/' +
            'VirtualBox-4.3-4.3.22_98236_fedora18-1.x86_64.rpm'
        }
      },
      b2d: 'https://github.com/boot2docker/boot2docker-cli/releases/download/' +
        'v1.6.2/boot2docker-v1.6.2-linux-amd64'
    },
    win32: {
      b2d: 'https://github.com/boot2docker/windows-installer/releases/' +
      'download/v1.6.0/docker-install.exe'
    },
    darwin: {
      b2d: 'https://github.com/boot2docker/osx-installer/releases/download/' +
      'v1.6.0/Boot2Docker-1.6.0.pkg'
    }
  }
};
