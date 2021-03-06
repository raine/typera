import * as koa from 'koa'
import * as koaRouter from 'koa-router'
import 'koa-bodyparser' // Adds `body` to ctx.request

import * as common from 'typera-common'
export { RequestHandler } from 'typera-common'

import { getRouteParams } from './context'
import * as Middleware from './middleware'
import * as Parser from './parser'
import * as Response from './response'
import * as URL from './url'
export { Middleware, Parser, Response, URL }

interface KoaRequestBase {
  ctx: koa.Context
}

function makeRequestBase(ctx: koa.Context): KoaRequestBase {
  return { ctx }
}

export type Route<Response extends common.Response.Generic> = common.Route<
  koa.Context,
  Response
>

export function applyMiddleware<Middleware extends Middleware.Generic[]>(
  ...middleware: Middleware
): common.RouteFn<koa.Context, KoaRequestBase, Middleware> {
  return common.applyMiddleware(makeRequestBase, getRouteParams, middleware)
}

export const route = applyMiddleware()

type GenericRoute = Route<common.Response.Generic>

class Router {
  private _routes: GenericRoute[]

  constructor(...routes: GenericRoute[]) {
    this._routes = routes
  }

  add(...routes: GenericRoute[]): Router {
    return new Router(...this._routes.concat(routes))
  }

  handler(): koa.Middleware {
    const router = new koaRouter()
    this._routes.forEach(route => {
      router[route.method](route.urlPattern, run(route.routeHandler))
    })
    return router.routes() as koa.Middleware<any, any>
  }
}

export function router(...routes: Route<common.Response.Generic>[]): Router {
  return new Router(...routes)
}

export type RouteHandler<
  Response extends common.Response.Generic
> = common.RouteHandler<koa.Context, Response>

export function routeHandler<Middleware extends Middleware.Generic[]>(
  ...middleware: Middleware
): common.MakeRouteHandler<koa.Context, KoaRequestBase, Middleware> {
  return common.routeHandler(makeRequestBase, middleware)
}

export function run<Response extends common.Response.Generic>(
  handler: RouteHandler<Response>
): (ctx: koa.Context) => Promise<void> {
  return async ctx => {
    const response = await handler(ctx)
    ctx.response.status = response.status
    if (response.headers != null) {
      ctx.response.set(response.headers)
    }
    ctx.response.body = response.body || ''
  }
}
