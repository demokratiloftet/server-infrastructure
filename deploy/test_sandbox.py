import unittest
from sandbox import topology, app_name, DOMAIN


class Boundaries(unittest.TestCase):
    def test_only_safe_nonreserved_names(self):
        for name in ['pds', 'plc', 'www', '../foo', 'bad`)', '-app', 'app-', 'A', 'a' * 51, 'app\n']:
            with self.subTest(name=name), self.assertRaises(ValueError):
                app_name(name)
        self.assertEqual(app_name('hello-world'), 'hello-world')

    def test_apps_cannot_publish_ports_or_join_service_networks(self):
        config = topology('hello', 3211)
        app = config['services']['app']
        self.assertEqual(app['networks'], ['sandbox'])
        self.assertTrue(config['networks']['sandbox']['internal'])
        for forbidden in ['ports', 'volumes', 'privileged', 'network_mode', 'devices']:
            self.assertNotIn(forbidden, app)
        self.assertEqual(app['user'], '1000:1000')
        self.assertTrue(app['read_only'])
        self.assertEqual(app['cap_drop'], ['ALL'])
        self.assertEqual(app['environment']['PDS_URL'], 'http://gateway:3001')
        self.assertEqual(config['services']['gateway']['ports'], ['127.0.0.1:3211:3000'])
        rule = config['services']['gateway']['labels']['traefik.http.routers.sandbox-hello.rule']
        self.assertEqual(rule, f'Host(`hello.{DOMAIN}`)')

    def test_pds_optout_and_no_arbitrary_port(self):
        config = topology('hello', 3211, pds=False)
        self.assertNotIn('PDS_URL', config['services']['app']['environment'])
        self.assertNotIn('services', config['networks'])
        for port in [True, 22, 3209, 3300, '3210']:
            with self.assertRaises(ValueError):
                topology('hello', port)


if __name__ == '__main__':
    unittest.main()
