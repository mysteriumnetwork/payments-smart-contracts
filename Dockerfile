FROM node:12.16.3

WORKDIR /src
ADD . /src

RUN npm i
RUN npm run compile

