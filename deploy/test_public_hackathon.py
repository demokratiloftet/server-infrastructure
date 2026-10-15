import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('public_hackathon', Path(__file__).with_name('public-hackathon.py'))
publication = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publication)


class PublicationBoundaries(unittest.TestCase):
    def test_bridges_have_no_core_pds_credentials_or_published_ports(self):
        config = publication.topology()
        self.assertEqual(set(config['services']), {'app-protospace', 'sports-publisher', 'sports-viewer'})
        self.assertTrue(config['networks']['public']['internal'])
        for name, service in config['services'].items():
            self.assertEqual(set(service['networks']), {'public', name})
            self.assertEqual(config['networks'][name]['name'], f'protospace-{name}_sandbox')
            self.assertEqual(service['environment'], {'UPSTREAM_HOST': 'app'})
            self.assertEqual(service['volumes'], ['./gateway.mjs:/gateway.mjs:ro'])
            self.assertEqual(service['cap_drop'], ['ALL'])
            self.assertEqual(service['user'], '1000:1000')
            self.assertTrue(service['read_only'])
            for forbidden in ['ports', 'privileged', 'network_mode', 'devices', 'env_file']:
                self.assertNotIn(forbidden, service)
        self.assertNotIn('pds', publication.APPS)
        self.assertNotIn('organisation-verifier', publication.APPS)


if __name__ == '__main__':
    unittest.main()
