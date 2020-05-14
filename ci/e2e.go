package ci

import (
	"strings"

	"github.com/magefile/mage/sh"
	"github.com/rs/zerolog/log"
)

// E2e runs the e2e test suite.
func E2e() error {
	defer sh.RunV("docker-compose", "down")
	err := sh.RunV("docker-compose", "up", "--build", "-d")
	if err != nil {
		log.Info().Msg("Could not start containers")
		return err
	}
	err = sh.RunV("docker", strings.Split("run --network payments-smart-contracts_default payments-smart-contracts_psc npm run e2e", " ")...)
	if err != nil {
		log.Info().Msg("Tests failed.")
		return err
	}
	log.Info().Msg("Tests succeeded!")
	return nil
}
