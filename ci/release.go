package ci

import (
	"errors"
	"fmt"
	"os"
	"strings"

	"github.com/magefile/mage/mg"
	"github.com/magefile/mage/sh"
	"github.com/rs/zerolog/log"
)

func installGhrIfNeeded() error {
	err := sh.Run("command", "-v", "ghr")
	if err == nil {
		return nil
	}
	log.Info().Msg("ghr not found, will install")
	// Ideally, I'd just use a library, but all of them seem to live in the main package, so no import :(
	return sh.RunV("go", "get", "-u", "github.com/tcnksm/ghr")
}

// Release releases the artifacts
func Release() error {
	mg.Deps(installGhrIfNeeded)

	tag := os.Getenv("BUILD_TAG")
	if tag == "" {
		return errors.New("no tag specified")
	}
	token := os.Getenv("GITHUB_TOKEN")
	if tag == "" {
		return errors.New("no github token specified")
	}

	log.Info().Msgf("releasing for TAG: %v", tag)

	defer sh.RunV("docker-compose", "down")
	err := sh.RunV("docker-compose", "build", "psc")
	if err != nil {
		log.Error().Err(err).Msgf("could not build container")
		return err
	}

	err = sh.RunV("docker-compose", "up", "-d")
	if err != nil {
		log.Error().Err(err).Msgf("could not build container")
		return err
	}

	_ = os.Mkdir("./build", 0700)
	o, err := sh.Output("docker", strings.Split("ps -a --filter ancestor=payments-smart-contracts_psc --format {{.ID}}", " ")...)
	if err != nil {
		log.Error().Err(err).Msgf("could not get container ID")
		return err
	}

	err = sh.RunV("docker", strings.Split(fmt.Sprintf("cp %v:/src/build/ ./build", strings.TrimSpace(o)), " ")...)
	if err != nil {
		log.Error().Err(err).Msgf("could not copy build artifacts")
		return err
	}

	return sh.RunWith(map[string]string{
		"GITHUB_TOKEN": token,
	}, "ghr", "-replace", tag, "build/contracts/")
}
